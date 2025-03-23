# COQUIZ
### 배포 시 keystore 생성 방법
keytool -genkeypair -v -keystore coquiz.keystore -alias coquizappkey -keyalg RSA -keysize 2048 -validity 10000