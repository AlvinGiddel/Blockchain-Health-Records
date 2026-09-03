import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'bhc_auth_token';
const USER_KEY = 'bhc_user_profile';
const PRIVATE_KEY = 'bhc_private_key';

/**
 * Hardware-backed secure storage for sensitive credentials and cryptographic keys
 */
export async function saveAuthToken(token) {
  try {
    if (token) {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
    } else {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    }
  } catch (err) {
    console.error('[SecureVault] Error saving token:', err);
  }
}

export async function getAuthToken() {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch (err) {
    console.error('[SecureVault] Error reading token:', err);
    return null;
  }
}

export async function saveUserProfile(user) {
  try {
    if (user) {
      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
      if (user.privateKey || user.private_key) {
        await SecureStore.setItemAsync(PRIVATE_KEY, user.privateKey || user.private_key);
      }
    } else {
      await SecureStore.deleteItemAsync(USER_KEY);
      await SecureStore.deleteItemAsync(PRIVATE_KEY);
    }
  } catch (err) {
    console.error('[SecureVault] Error saving profile:', err);
  }
}

export async function getUserProfile() {
  try {
    const data = await SecureStore.getItemAsync(USER_KEY);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.error('[SecureVault] Error reading profile:', err);
    return null;
  }
}

export async function clearVault() {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
    await SecureStore.deleteItemAsync(PRIVATE_KEY);
  } catch (err) {
    console.error('[SecureVault] Error clearing vault:', err);
  }
}
