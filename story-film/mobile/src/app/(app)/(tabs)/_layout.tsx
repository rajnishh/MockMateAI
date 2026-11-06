import { Tabs } from "expo-router";

import { MiniPlayer } from "@/components/mini-player";
import { TabBar } from "@/components/tab-bar";

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => (
        <>
          <MiniPlayer />
          <TabBar {...props} />
        </>
      )}
      screenOptions={{ headerShown: false }}>
      {/* design/v3.0/navigation.md: Create sits in the centre; Calendar and Inbox live under You (and Home's bell). */}
      <Tabs.Screen name="home" options={{ title: "Home" }} />
      <Tabs.Screen name="studio" options={{ title: "Studio" }} />
      <Tabs.Screen name="create" options={{ title: "Create" }} />
      <Tabs.Screen name="listen" options={{ title: "Listen" }} />
      <Tabs.Screen name="you" options={{ title: "You" }} />
    </Tabs>
  );
}
