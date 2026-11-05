import AppIntents
import UIKit

// "Hey Siri, make with Reelkar": Siri asks what to make, then Reelkar opens "Here's what I heard"
// with it filled in (reelkar://create?prompt=…). Nothing is made until the creator taps Make it.
// Also shows up as an action in the Shortcuts app, so any app (Gemini too) can hand text to Reelkar.
@available(iOS 16.0, *)
struct MakeWithReelkarIntent: AppIntent {
  static var title: LocalizedStringResource = "Make with Reelkar"
  static var description = IntentDescription("Tell Reelkar what to make: a song, a reel or a music video.")
  static var openAppWhenRun: Bool = true

  @Parameter(title: "What to make", requestValueDialog: "What should Reelkar make?")
  var prompt: String

  @MainActor
  func perform() async throws -> some IntentResult {
    var link = URLComponents()
    link.scheme = "reelkar"
    link.host = "create"
    link.queryItems = [URLQueryItem(name: "prompt", value: prompt)]
    if let url = link.url {
      await UIApplication.shared.open(url)
    }
    return .result()
  }
}

@available(iOS 16.0, *)
struct ReelkarShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: MakeWithReelkarIntent(),
      phrases: [
        "Make with \(.applicationName)",
        "Make a \(.applicationName) song",
        "Create with \(.applicationName)",
      ],
      shortTitle: "Make with Reelkar",
      systemImageName: "mic.fill"
    )
  }
}
