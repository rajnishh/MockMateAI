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
      <Tabs.Screen name="home" options={{ title: "Home" }} />
      <Tabs.Screen name="create" options={{ title: "Create" }} />
      <Tabs.Screen name="calendar" options={{ title: "Calendar" }} />
      <Tabs.Screen name="inbox" options={{ title: "Inbox" }} />
      <Tabs.Screen name="listen" options={{ title: "Listen" }} />
    </Tabs>
  );
}
