"use client";

import { useEffect, useState } from "react";

// The creator's time zone, so "tomorrow at 7:30 pm" from the assistant means theirs.
export function TimeZoneField() {
  const [tz, setTz] = useState("");
  useEffect(() => setTz(Intl.DateTimeFormat().resolvedOptions().timeZone), []);
  return <input type="hidden" name="time_zone" value={tz} />;
}
