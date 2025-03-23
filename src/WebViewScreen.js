import React, {useEffect, useRef, useState} from 'react';
import {
  AppState,
  BackHandler,
  Platform,
  SafeAreaView,
  Vibration,
  Image,
  Linking,
  PermissionsAndroid,
} from 'react-native';
import WebView from 'react-native-webview';
import DeviceInfo from 'react-native-device-info';
import analytics from '@react-native-firebase/analytics';
import SoundPlayer from 'react-native-sound-player';
import mobileAds, {useRewardedAd, useInterstitialAd} from 'react-native-google-mobile-ads';
import {
  clearTransactionIOS,
  finishTransaction,
  flushFailedPurchasesCachedAsPendingAndroid,
  getProducts,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
} from 'react-native-iap';
import Sound from "react-native-sound";
import PushNotification from "react-native-push-notification";
import PushNotificationIOS from "@react-native-community/push-notification-ios";
import messaging from "@react-native-firebase/messaging";
import AsyncStorage from "@react-native-async-storage/async-storage";
import SplashScreen from "react-native-splash-screen";
import NetInfo from "@react-native-community/netinfo";
import RNExitApp from 'react-native-exit-app';
import {Web3Modal, useWeb3Modal} from '@web3modal/react-native';
import DisconnectedImg from './disconnected.jpg';
import {check, PERMISSIONS, request, RESULTS} from "react-native-permissions";
import Loading from "./Loading";
import axios from "axios";
import {compareVersions} from "./util";
import CodePush from "react-native-code-push";

PushNotification.configure({
  // (required) 리모트 노티를 수신하거나, 열었거나 로컬 노티를 열었을 때 실행
  onNotification: function (notification: any) {
    console.log('NOTIFICATION:', notification);
    // process the notification
    notification.finish(PushNotificationIOS.FetchResult.NoData);
  },

  // IOS ONLY (optional): default: all - Permissions to register.
  permissions: {
    alert: true,
    badge: true,
    sound: true,
  },
});

const loadSetting = async() => {
  const str = await AsyncStorage.getItem('setting');
  return JSON.parse(str);
}

const saveSetting = async(obj) => {
  const str = JSON.stringify(obj);
  await AsyncStorage.setItem('setting', str);
}

const rewardedId = Platform.OS === 'android' ? "ca-app-pub-8020861757941184/8745214789" : "ca-app-pub-8020861757941184/2578164204";
const fullscreenId = Platform.OS === 'android' ? 'ca-app-pub-8020861757941184/2019946061' : 'ca-app-pub-8020861757941184/2614842436';

const providerMetadata = {
  name: 'COQUIZ',
  description: 'COQUIZ',
  url: 'https://www.coquiz.space',
  icons: ['https://www.coquiz.space/img/beta/conut.png'],
};

const WebViewScreen = () => {
  const appState = useRef(AppState.currentState);
  const webViewRef = useRef(null);
  const mbIdRef = useRef('');
  const adTypeRef = useRef('');
  const isOpenRef = useRef(false);

  const [webViewUrl, setWebViewUrl] = useState('https://www.coquiz.space/0_v1/index.php');
  const [isReady, setIsReady] = useState(false);
  const [isDisconnected, setIsDisconnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [uid, setUid] = useState(null);
  const [token, setToken] = useState(null);
  const [purchaseSuccess, setPurchaseSuccess] = useState(null);
  const [purchaseFail, setPurchaseFail] = useState(null);
  const [bgmName, setBgmName] = useState('bgm_normal');
  const [bgmStatus, setBgmStatus] = useState('stop');
  const [setting, setSetting] = useState({
    bgm: '',
    sound: '',
    vibrate: '',
    push: '',
  });

  const {open, isOpen, address, isConnected} = useWeb3Modal();

  // Admob
  const {
    load: loadRewarded,
    show: showRewarded,
    isClosed: isRewardedClosed,
    isLoaded: isRewardedLoaded,
    isEarnedReward
  } = useRewardedAd(rewardedId);
  const {
    load: loadFullscreen,
    show: showFullscreen,
    isClosed: isFullscreenClosed,
    isLoaded: isFullscreenLoaded
  } = useInterstitialAd(fullscreenId);
  const isRewardedClosedRef = useRef(null);
  const isFullscreenClosedRef = useRef(null);

  useEffect(() => {
    loadRewarded();
  }, [loadRewarded]);

  useEffect(() => {
    loadFullscreen();
  }, [loadFullscreen]);

  useEffect(() => {
    if (isRewardedClosedRef.current === false && isRewardedClosed === true) {
      if (isEarnedReward) {
        postMessageToWebView('admobCallSuccess', {
          mb_id: mbIdRef.current,
          ad_type: adTypeRef.current,
        });
      }
      loadRewarded();
    }

    isRewardedClosedRef.current = isRewardedClosed;
  }, [isRewardedClosed, isEarnedReward]);

  useEffect(() => {
    if (isFullscreenClosedRef.current === false && isFullscreenClosed === true) {
      postMessageToWebView('admobCallSuccess', {
        mb_id: mbIdRef.current,
        ad_type: adTypeRef.current,
        fullscreen: 'true',
      });
      loadFullscreen();
    }

    isFullscreenClosedRef.current = isFullscreenClosed;
  }, [isFullscreenClosed]);

  // componentDidMount
  useEffect(() => {
    setTimeout(() => {
      setIsReady(true);
      SplashScreen.hide();

      NetInfo.addEventListener(state => {
        setIsDisconnected(!state.isConnected);
      });
    }, 5000);

    if (Platform.OS === 'android') {
      AppState.addEventListener('change', nextAppState => {
        if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
          setBgmStatus('resume');
        } else {
          setBgmStatus('stop');
        }
        appState.current = nextAppState;
      });
    }

    // 백키 종료 확인
    BackHandler.addEventListener("hardwareBackPress", () => {
        postMessageToWebView('backKeyPress', 'dummy');
        return true;
      }
    );

    init();
  }, []);

  // 최초 실행 시 or 세팅값 바뀔 시
  useEffect(() => {
    const handlePushSetting = async () => {
      try {
        if (setting.push === '0') {
          // FCM 토큰 삭제
          await messaging().deleteToken();
          setToken(null);
          console.log('Push notifications disabled, FCM token deleted');

          postMessageToWebView('getFirebaseTokenSuccess', {
            userMachin: uid,
            firebaseToken: null,
          });
        } else if (setting.push === '1') {
          // 디바이스가 다시 FCM 서버에 등록되도록 함
          await messaging().registerDeviceForRemoteMessages();
          const newToken = await messaging().getToken();
          setToken(newToken);
          console.log('Push notifications enabled, FCM token:', newToken);

          postMessageToWebView('getFirebaseTokenSuccess', {
            userMachin: uid,
            firebaseToken: newToken,
          });
        }
      } catch (error) {
        console.error('Error handling push notification setting:', error);
      }
    };

    handlePushSetting();

    if (setting.bgm === '0') {
      setBgmStatus('stop');
    } else if (setting.bgm === '1') {
      setBgmStatus('start');
    }
  }, [setting]);

  useEffect(() => {
    if (!!webViewRef.current) {
      if (!!purchaseSuccess) {
        postMessageToWebView('requestPurchaseSuccess', purchaseSuccess);
        setPurchaseSuccess(null);
      }

      if (!!purchaseFail) {
        postMessageToWebView('requestPurchaseFail', purchaseFail);
        setPurchaseFail(null);
      }
    }
  }, [webViewRef.current, purchaseSuccess, purchaseFail]);

  useEffect(() => {
    switch (bgmStatus) {
      case 'start':
        if (setting.bgm === '1') {
          SoundPlayer.playSoundFile(bgmName, 'mp3');
        }
        break;
      case 'resume':
        if (setting.bgm === '1') {
          SoundPlayer.resume();
        }
        break;
      case 'stop':
        SoundPlayer.stop();
        break;
      case 'pause':
        SoundPlayer.pause();
        break;
    }

    const onFinishedPlaying = SoundPlayer.addEventListener('FinishedPlaying', () => {
      SoundPlayer.playSoundFile(bgmName, 'mp3');
    });

    return () => onFinishedPlaying.remove();
  }, [bgmName, bgmStatus]);

  useEffect(() => {
    const sendAddress = async () => {
      if (isOpenRef.current) {
        if (address) {
          postMessageToWebView('connectWalletSuccess', {address})
        } else {
          postMessageToWebView('disconnectWalletSuccess');
        }

        isOpenRef.current = false;
      }
    };
    sendAddress();
  }, [address]);

  const init = async() => {
    requestPermission();
    await checkRequiredVersion();
    await initAdmob();
    await getUid();
    await initSetting();
    await initProducts();
  }

  const requestPermission = () => {
    if (Platform.OS === 'ios') {
      messaging().requestPermission();
    } else if (Platform.OS === 'android' && Platform.Version >= 33) {
      PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
      );
    }
  }

  const checkRequiredVersion = async() => {
    try {
      let minimumVersion;
      const {data} = await axios.get('https://conut-backend-c9308ac7120b.herokuapp.com/minimum-version/coquiz');
      if (Platform.OS === 'android') {
        minimumVersion = data.android;
      } else {
        minimumVersion = data.ios;
      }

      const currentVersion = DeviceInfo.getVersion();
      console.log({currentVersion, minimumVersion})

      if (compareVersions(currentVersion, minimumVersion) < 0) {
        setWebViewUrl('https://www.coquiz.space/0_v1/app_update_info.php');
      } else {
        CodePush.sync({
          updateDialog: {
            mandatoryUpdateMessage: '앱 안정화를 위해 재시작합니다.',
            mandatoryContinueButtonLabel: '재시작',
          },
          installMode: CodePush.InstallMode.IMMEDIATE
        });
      }
    } catch (error) {
      console.error('Error checking app version:', error);
    }
  };

  // 기기 고유값 획득
  const getUid = async() => {
    const uniqueId = await DeviceInfo.getUniqueId();
    setUid(uniqueId);
  }

  // 세팅값 불러오기
  const initSetting = async() => {
    const initialSetting = {
      bgm: "1",
      sound: "1",
      vibrate: "1",
      push: "1",
    }

    const loadedSetting = await loadSetting();
    if (!loadedSetting) {
      saveSetting(initialSetting);
      setSetting(initialSetting);
    } else {
      setSetting(loadedSetting);
    }
  };

  // 애드몹
  const initAdmob = async() => {
    const result = await check(PERMISSIONS.IOS.APP_TRACKING_TRANSPARENCY);
    if (result === RESULTS.DENIED) {
      // The permission has not been requested, so request it.
      await request(PERMISSIONS.IOS.APP_TRACKING_TRANSPARENCY);
    }

    await mobileAds().initialize();
  };

  // 인앱결제
  const initProducts = async() => {
    try {
      const init = await initConnection();
      if (init) {
        if (Platform.OS === 'android') {
          await flushFailedPurchasesCachedAsPendingAndroid();
        } else {
          await clearTransactionIOS();
        }
      }

      // 구매 성공 listener
      purchaseUpdatedListener(async (purchase) => {
          const receipt = purchase.transactionReceipt ? purchase.transactionReceipt : purchase.purchaseToken;
          if (receipt) {
            try {
              await finishTransaction({purchase, isConsumable: true});

              // 구매이력 저장 및 상태 갱신
              if (purchase) {
                setPurchaseSuccess({
                  mb_id: mbIdRef.current,
                  item_id: purchase.productId,
                  transaction_id: purchase.transactionId,
                  platform: !!purchase.dataAndroid ? 'android' : 'ios',
                })
              }
            } catch(error) {
              console.log('ackError: ', error);
            }
          }
        }
      );

      // 구매 실패 listener
      purchaseErrorListener((error) => {
        const USER_CANCEL = 'E_USER_CANCELED';
        if (error && error.code === USER_CANCEL) {
          setPurchaseFail({mb_Id: mbIdRef.current, reason: 'cancel'});
        } else {
          setPurchaseFail({mb_Id: mbIdRef.current, reason: 'error'});
        }
      });
    } catch (e) {
      console.error('IAP connection error: ', e);
    }
  };

  // 웹뷰로부터 메시지 수신
  const onMessage = async(e) => {
    console.log('웹뷰로부터 받은 메시지: ' + e.nativeEvent.data);

    const {type, value} = JSON.parse(e.nativeEvent.data);

    switch (type) {
      case 'productList':
        const productList = value.item_uid.split(',').map(element => element.trim());
        getProducts({skus: productList});
        break;

      case 'getUserMachin':
        if (uid) {
          postMessageToWebView('getUserMachinSuccess', uid);
        } else {
          postMessageToWebView('getUserMachinFail');
        }
        break;

      case 'getFirebaseToken':
        postMessageToWebView('getFirebaseTokenSuccess', {
          userMachin: uid,
          firebaseToken: token,
        });
        break;

      case 'getVersion':
        const currentVersion = DeviceInfo.getVersion();
        postMessageToWebView('getVersionSuccess', currentVersion);
        break;

      case 'saveUserInfo':
        if (!!value.mb_point) {
          updatePoint(value.mb_point);
        }
        mbIdRef.current = value.mb_id;
        postMessageToWebView('saveUserInfoSuccess', mbIdRef.current);
        break;

      case 'editUserInfo':
        if (!!value.mb_point) {
          updatePoint(value.mb_point);
        }
        mbIdRef.current = value.mb_id;
        postMessageToWebView('editUserInfoSuccess', mbIdRef.current)
        break;

      case 'getSetting':
        postMessageToWebView('getSettingSuccess', setting);
        break;

      case 'saveSetting':
        const newSetting = {
          ...setting,
          ...value,
        }
        saveSetting(newSetting);
        postMessageToWebView('saveSettingSuccess', newSetting);
        setSetting(newSetting);
        break;

      case 'bgmStart':
        setBgmName(value.file);
        setBgmStatus('start');
        break;

      case 'bgmStop':
        setBgmStatus('stop');
        break;

      case 'bgmPause':
        setBgmStatus('pause');
        break;

      case 'bgmResume':
        setBgmStatus('resume');
        break;

      case 'soundStart':
        if (setting.sound === '1') {
          const sound = new Sound(
            value.file + '.mp3',
            Sound.MAIN_BUNDLE,
            () => sound.play(() => sound.release()),
          );
        }
        break;

      case 'vibrateStart':
        if (setting.vibrate === '1') {
          if (!value) {
            Vibration.vibrate();
          } else {
            const terms = value.pattern.split(',');   // 500,1000
            const pattern = [0];

            terms.map(term => {
              pattern.push(400);
              pattern.push(Number(term));
            })
            pattern.push(400);    // 0,400,500,400,1000,400

            Vibration.vibrate(pattern);
          }
        }
        break;

      case 'admobCall':
        mbIdRef.current = value.mb_id;
        adTypeRef.current = value.ad_type;

        try {
          if (value.fullscreen === 'true') {
            if (isFullscreenLoaded) {
              showFullscreen();
            } else {
              // 다시 로드하고 5초 뒤 노출 시도
              loadFullscreen();
              setIsLoading(true);
              setTimeout(() => {
                setIsLoading(false);
                try {
                  showFullscreen();
                } catch (e) {
                  console.error('retry error: ' + e.message);
                  postMessageToWebView('admobCallFail', {
                    mb_id: mbIdRef.current,
                    ad_type: adTypeRef.current,
                    fullscreen: 'true',
                    fail_message: e.message,
                  });
                }
              }, 5000);
            }
          } else {
            if (isRewardedLoaded) {
              showRewarded();
            } else {
              // 다시 로드하고 5초 뒤 노출 시도
              loadRewarded();
              setIsLoading(true);
              setTimeout(() => {
                setIsLoading(false);
                try {
                  showRewarded();
                } catch (e) {
                  console.error('retry error: ' + e.message);
                  postMessageToWebView('admobCallFail', {
                    mb_id: mbIdRef.current,
                    ad_type: adTypeRef.current,
                    fail_message: e.message,
                  });
                }
              }, 5000);
            }
          }
        } catch (e) {
          console.error(e.message);
          if (value.fullscreen === 'true') {
            postMessageToWebView('admobCallFail', {
              mb_id: mbIdRef.current,
              ad_type: adTypeRef.current,
              fullscreen: 'true',
              fail_message: e.message,
            });
          } else {
            postMessageToWebView('admobCallFail', {
              mb_id: mbIdRef.current,
              ad_type: adTypeRef.current,
              fail_message: e.message,
            });
          }
        }
        break;

      case 'requestPurchase':
        mbIdRef.current = value.mb_id;
        try {
          if (Platform.OS === 'android') {
            requestPurchase({skus: [value.item_id]});
          } else {
            requestPurchase({sku: value.item_id});
          }
        } catch (e) {
          console.error(e);
          postMessageToWebView('requestPurchaseFail');
        }
        break;

      case 'connectWallet':
        try {
          if (!isConnected) {
            open();
            isOpenRef.current = true;
          } else {
            postMessageToWebView('connectWalletSuccess', {address});
          }
        } catch (e) {
          console.error(e);
          postMessageToWebView('connectWalletFail');
        }
        break;

      case 'disconnectWallet':
        try {
          if (isConnected) {
            open();
            isOpenRef.current = true;
          } else {
            postMessageToWebView('disconnectWalletFail');
          }
        } catch (e) {
          console.error(e);
          postMessageToWebView('disconnectWalletFail');
        }
        break;

      case 'exitApp':
        RNExitApp.exitApp();
        break;

      default:
        break;
    }
  }

  // 웹뷰로 메시지 발송
  const postMessageToWebView = (type, value) => {
    const message = { type, value };

    console.log('웹뷰로 보낸 메시지: ' + JSON.stringify(message));
    if (webViewRef.current) {
      webViewRef.current.postMessage(JSON.stringify(message));
    }
  }

  // 애널리틱스에 최신 점수 보내기
  const updatePoint = async(point) => {
    await analytics().setUserProperty('point', point);
    await analytics().logEvent('update_user');
  };

  return (
    <SafeAreaView style={{flex: 1}}>
      {
        isReady &&
          isDisconnected ?
            <Image
              source={DisconnectedImg}
              style={{width: '100%', height: '100%'}}
            />
            :
            <WebView
              ref={webViewRef}
              source={{ uri: webViewUrl }}
              onMessage={onMessage}
              onNavigationStateChange={(e) => {
                if (Platform.OS === 'ios' && e?.url?.toString().includes('app_open_target=blank')) {
                  webViewRef.current.stopLoading();
                  Linking.openURL(e.url);
                }
              }}
            />
      }
      {
        isLoading && <Loading />
      }
      <Web3Modal
        projectId='43989f48e771c95cde23f7c8bd830e0b'
        providerMetadata={providerMetadata}
      />
    </SafeAreaView>
  );
}

export default WebViewScreen;
