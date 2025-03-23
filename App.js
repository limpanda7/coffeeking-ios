import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {NavigationContainer} from '@react-navigation/native';
import WebViewScreen from './src/WebViewScreen';
import CodePush from "react-native-code-push";

const Stack = createNativeStackNavigator();

const App = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName='WebView'>
        <Stack.Screen name='WebView' component={WebViewScreen} options={{headerShown: false}}/>
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const codePushOptions = { checkFrequency: CodePush.CheckFrequency.MANUAL };
export default CodePush(codePushOptions)(App);
