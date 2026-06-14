import * as LocalAuthentication from 'expo-local-authentication';

export class BiometricService {
  static async isHardwareAvailable(): Promise<boolean> {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    return hasHardware && isEnrolled;
  }

  static async authenticateUser(): Promise<boolean> {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Secure Vault',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });
    return result.success;
  }
}