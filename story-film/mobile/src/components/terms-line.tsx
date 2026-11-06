import * as WebBrowser from "expo-web-browser";
import { Text } from "react-native";

import { Txt } from "@/components/ui";
import { fonts, useTheme } from "@/theme";

export const TERMS_URL = "https://reelkar.istari-ai.dev/terms";
export const PRIVACY_POLICY_URL = "https://reelkar.istari-ai.dev/privacy";

const open = (url: string) => WebBrowser.openBrowserAsync(url).catch(() => undefined);

// Under sign-in: what continuing agrees to (App Review 1.2). The Terms say there's no tolerance for
// objectionable content or abusive users.
export function TermsLine() {
  const { colors } = useTheme();
  const link = { color: colors.tealText, fontFamily: fonts.bold };
  return (
    <Txt variant="cap" style={{ textAlign: "center" }}>
      By continuing you agree to the{" "}
      <Text accessibilityRole="link" suppressHighlighting onPress={() => open(TERMS_URL)} style={link}>
        Terms
      </Text>{" "}
      and{" "}
      <Text accessibilityRole="link" suppressHighlighting onPress={() => open(PRIVACY_POLICY_URL)} style={link}>
        Privacy Policy
      </Text>
      .
    </Txt>
  );
}
