import { useEffect, useState } from "react";
import { Image, Text, View } from "react-native";

import { api, type AvatarView } from "@/lib/api";
import { findAvatar } from "@/lib/avatars";
import { API_URL } from "@/lib/config";
import { fonts, useTheme } from "@/theme";

// A profile photo: a picked-but-not-saved photo (`localUri`), the saved photo, a ready-made
// avatar, or the name's first letter when there's none yet.
export function Avatar({ avatar, name, size = 52, localUri }: { avatar: AvatarView | undefined; name?: string; size?: number; localUri?: string | null }) {
  const { colors } = useTheme();
  const preset = findAvatar(avatar?.preset);
  const remote = avatar?.url ? (/^(https?|file):/.test(avatar.url) ? avatar.url : `${API_URL}${avatar.url}`) : null;
  const uri = localUri ?? remote;
  // The app's own photo route needs the session cookie, like song covers.
  const [headers, setHeaders] = useState<Record<string, string> | null>(null);
  // Kept per address, so a new photo gets its own try.
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const failed = Boolean(uri) && failedUri === uri;
  useEffect(() => {
    if (uri && !localUri) api.videoHeaders().then(setHeaders).catch(() => setHeaders({}));
  }, [uri, localUri]);

  const box = { width: size, height: size, borderRadius: size / 2, overflow: "hidden" as const, alignItems: "center" as const, justifyContent: "center" as const };
  if (uri && !failed) {
    return (
      <View style={[box, { backgroundColor: colors.surfaceSunken }]} accessibilityLabel="Profile photo" accessibilityRole="image">
        {localUri || headers ? (
          <Image source={{ uri, headers: localUri ? undefined : (headers ?? undefined) }} style={{ width: size, height: size }} onError={() => setFailedUri(uri)} accessibilityIgnoresInvertColors />
        ) : null}
      </View>
    );
  }
  if (preset) {
    return (
      <View style={[box, { backgroundColor: preset.bg }]} accessibilityLabel={`Avatar: ${preset.label}`} accessibilityRole="image">
        <Text style={{ fontSize: size * 0.52 }} allowFontScaling={false}>
          {preset.emoji}
        </Text>
      </View>
    );
  }
  return (
    <View style={[box, { backgroundColor: colors.tealTint }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text style={{ fontFamily: fonts.bold, fontSize: size * 0.4, color: colors.tealText }} allowFontScaling={false}>
        {(name?.trim() || "C").charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}
