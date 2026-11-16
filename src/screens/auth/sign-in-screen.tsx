import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, type TextInputInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { TextField } from '@/components/ui/text-field';
import { Radius, Spacing } from '@/constants/theme';
import { useSession } from '@/contexts/session-context';
import { useTheme } from '@/hooks/use-theme';
import { apiConfig } from '@/services/api/config';
import { errorMessage } from '@/services/api/errors';
import { biometryUnavailableReason } from '@/services/secure-store/biometrics';

/** Sign-in reads best as a narrow column on tablets. */
const FORM_MAX_WIDTH = 440;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignInScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { manager, state } = useSession();
  const { biometry, lockedProfile, notice, unlocking } = state;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const passwordRef = useRef<TextInputInstance>(null);
  const autoPrompted = useRef(false);

  const canUnlockWithBiometrics = state.status === 'locked' && !!lockedProfile?.biometricProtected;

  // Prompt once automatically when a biometric-protected session is waiting.
  useEffect(() => {
    if (canUnlockWithBiometrics && !autoPrompted.current) {
      autoPrompted.current = true;
      void manager.unlock();
    }
  }, [canUnlockWithBiometrics, manager]);

  async function submit() {
    const errors: typeof fieldErrors = {};
    if (!EMAIL_PATTERN.test(email.trim())) errors.email = 'Enter your corporate email address.';
    if (!password) errors.password = 'Enter your password.';
    setFieldErrors(errors);
    setFormError(null);
    if (errors.email || errors.password) return;

    setSubmitting(true);
    try {
      await manager.signIn(email.trim(), password);
      setPassword('');
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  const biometricIcon =
    Platform.OS === 'ios'
      ? ({ ios: biometry.label === 'Touch ID' ? 'touchid' : 'faceid', android: 'fingerprint' } as const)
      : ({ ios: 'faceid', android: 'fingerprint' } as const);

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.backgroundGrouped }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + Spacing.five, paddingBottom: insets.bottom + Spacing.four },
        ]}>
        <View style={styles.container}>
          <View style={styles.brand}>
            <View style={[styles.logo, { backgroundColor: theme.tint }]}>
              <Icon ios="checkmark.shield.fill" android="verified_user" size={30} color={theme.onTint} />
            </View>
            <ThemedText type="largeTitle" accessibilityRole="header">
              FieldOps
            </ThemedText>
            <ThemedText type="body" themeColor="textSecondary">
              Secure access to work orders and customer sites.
            </ThemedText>
          </View>

          {notice ? (
            <Banner testID="session-notice" tone={notice.tone} title={notice.title} message={notice.message} />
          ) : null}

          {state.status === 'locked' && lockedProfile ? (
            <View style={[styles.card, { backgroundColor: theme.surface }]}>
              <View style={styles.profile}>
                <ThemedText type="overline" themeColor="textSecondary">
                  Saved session
                </ThemedText>
                <ThemedText type="headline">{lockedProfile.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {lockedProfile.email}
                </ThemedText>
              </View>
              {lockedProfile.biometricProtected ? (
                <Button
                  testID="biometric-unlock"
                  title={`Unlock with ${biometry.label}`}
                  loading={unlocking}
                  icon={<Icon {...biometricIcon} size={18} color={theme.onTint} />}
                  onPress={() => void manager.unlock()}
                />
              ) : (
                <Button
                  title="Resume session"
                  loading={unlocking}
                  onPress={() => void manager.unlock()}
                />
              )}
            </View>
          ) : null}

          <View style={[styles.card, { backgroundColor: theme.surface }]}>
            {state.status === 'locked' ? (
              <ThemedText type="overline" themeColor="textSecondary">
                Or sign in with password
              </ThemedText>
            ) : null}
            <TextField
              testID="email-input"
              label="Work email"
              value={email}
              onChangeText={setEmail}
              placeholder="name@company.com"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="username"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              error={fieldErrors.email}
            />
            <TextField
              testID="password-input"
              ref={passwordRef}
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={() => void submit()}
              error={fieldErrors.password}
            />
            {formError ? (
              <ThemedText testID="form-error" type="small" themeColor="danger" accessibilityRole="alert">
                {formError}
              </ThemedText>
            ) : null}
            <Button testID="sign-in-button" title="Sign in" size="lg" loading={submitting} onPress={() => void submit()} />
          </View>

          <View style={styles.biometryInfo}>
            <Icon
              {...biometricIcon}
              size={16}
              color={biometry.available ? theme.success : theme.textTertiary}
            />
            <ThemedText type="caption" themeColor="textSecondary" style={styles.flex}>
              {biometry.available
                ? `${biometry.label} available. It protects your saved credentials when your security policy requires it.`
                : `Biometric unlock unavailable. ${biometryUnavailableReason(biometry)}`}
            </ThemedText>
          </View>

          <ThemedText type="caption" themeColor="textTertiary" style={styles.footer}>
            Demo environment · mock server {apiConfig.baseUrl}
          </ThemedText>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
  },
  container: {
    width: '100%',
    maxWidth: FORM_MAX_WIDTH,
    gap: Spacing.four,
  },
  brand: {
    gap: Spacing.two,
  },
  logo: {
    width: 56,
    height: 56,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  card: {
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
  },
  profile: {
    gap: Spacing.one,
  },
  biometryInfo: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.one,
  },
  footer: {
    textAlign: 'center',
  },
});
