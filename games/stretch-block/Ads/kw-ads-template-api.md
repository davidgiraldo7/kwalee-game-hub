# Kwalee Ads — Template API Reference

> Audience: developers (and LLMs) writing the HTML5 template and game code for
> Game Vault. Reference document. This describes hooks the game **calls**; the
> implementations are supplied by the build pipeline.

## What you own vs what you get

`shared.js` is injected at build time and owns the **mechanism**: talking to the
Almada mediation SDK, loading, preloading, reloading, consent, session handling
and analytics.

**You own the policy.** Specifically:

| Yours | Why |
| --- | --- |
| **When** an ad is requested | Only the game knows which beat can take an interruption |
| **Cooldowns / frequency** | Same — and it differs per game |
| **Placeholders** | Only the game knows what should fill the screen while an ad loads, or when none arrives |
| **What happens afterwards** | Resume, advance, restart — the game's call |

**Nothing shows an ad on your behalf.** There is no automatic interstitial, no
automatic banner. If you don't call these, players see no ads.

---

## Calling safely: feature-detect, don't stub

The ad functions only exist in a built app with ads enabled. They are **absent**
in two normal situations:

1. **Browser preview**, where `shared.js` does not exist at all.
2. **A build with ads disabled**, where the whole ad section is stripped out of
   `shared.js`.

So every call site must be guarded. `template.html` already does this for
rewarded video, and the same wrapper pattern is the right one for the other two
formats — it keeps the real ad on device *and* gives you a simulated ad in
preview, which is where your placeholder work lives:

```js
function requestRewardedAd(context){
    if (typeof window.kwRequestRewardedAd === "function"){
        return window.kwRequestRewardedAd(context);
    }
    return simulateRewardedAd(context);
}
```

Write one of these per format. Because the real functions and the simulators
both resolve the same `{ ... , reason, context }` shape, the calling code never
has to care which it got.

> **Don't** use the `window.kwRequestInterstitial = window.kwRequestInterstitial || ...`
> stub form for ads. It works, but it resolves `not-available` in preview, so you
> lose the simulated ad and can never exercise the flow outside a device build.
> That form is for **`kwGameAction`** only, which is fire-and-forget and has no
> fallback UI:
>
> ```js
> window.kwGameAction = window.kwGameAction || function () {};
> ```
>
> `kwGameAction` MUST be a `window.x = window.x || ...` assignment and never a
> `function kwGameAction() {}` declaration — a declaration is hoisted and would
> clobber the real implementation, silently disabling analytics in every build
> while looking correct in preview. See `docs/kw-game-action-api.md`.

## Do not write the level hooks

`kwLevelStarted` / `kwLevelCompleted` / `kwLevelFailed` / `kwContentCompleted`
are placed into the game's code automatically at build time by the pipeline's
LLM injector. **Don't call them by hand** — you'd double-report every level.
They are analytics only and show no ads.


---

## Interstitials

```
kwRequestInterstitial(context?) -> Promise<{ shown, reason, context }>
```

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `context` | `string` | No | Free-text label for *where* this was requested: `'level_complete'`, `'retry'`, `'quit_to_menu'`. Analytics only — it does not change behaviour. `snake_case`. |

### The promise resolves when the ad is DISMISSED

Not when it is shown. This is the important property: `.then()` **is** your "ad
finished" callback, and the right place to resume.

```js
pauseGame();
kwRequestInterstitial('level_complete').then(function (result) {
    resumeGame();      // runs after the ad closes, or immediately if none showed
    goToNextLevel();
});
```

It **never rejects**. Every failure path resolves. You do not need a `.catch()`.

### `result.reason`

| `reason` | `shown` | Meaning | What to do |
| --- | --- | --- | --- |
| `'shown'` | `true` | Ad was displayed and dismissed | Continue |
| `'not-available'` | `false` | Nothing cached yet (cold start, no fill, preview, ads-disabled build) | Continue. Show a placeholder if you want |
| `'failed'` | `false` | An ad existed but broke on presentation | Continue |
| `'busy'` | `false` | Another fullscreen ad is already on screen | Continue — do **not** retry in a loop |
| `'disabled'` | `false` | `kwAdPolicy.interstitialsEnabled` is `false` | Continue |

Treat every non-`'shown'` case the same way unless you have a specific reason
not to: **carry on with the game.** An ad must never be able to block
progression.

---

## Rewarded ads

```
kwRequestRewardedAd(context?) -> Promise<{ earned, reason, context }>
```

The opt-in format. Call it when the player *chooses* to spend a watch, and grant
the reward only when `earned` is `true`.

```js
watchAdButton.onclick = function () {
    kwRequestRewardedAd('extra_life').then(function (result) {
        if (result.earned) {
            grantExtraLife();
        } else if (result.reason === 'not-available') {
            showToast('No video available right now');
        }
    });
};
```

| `reason` | `earned` | Meaning |
| --- | --- | --- |
| `'earned'` | `true` | Player watched enough to earn the reward |
| `'declined'` | `false` | Player closed the ad early — **do not reward** |
| `'not-available'` | `false` | No ad to show |
| `'failed'` | `false` | Ad broke |
| `'busy'` | `false` | Another fullscreen ad is on screen |

`'declined'` vs `'earned'` is decided by the ad network, not by "did the ad
appear". This is why you must gate the reward on `earned` and never on the
promise merely resolving.

---

## Banners

```
kwShowBanner(context?)  -> Promise<{ shown, reason, context }>
kwHideBanner()          -> Promise<boolean>   // keeps the loaded ad, instant re-show
kwDestroyBanner()       -> Promise<boolean>   // releases it
```

**Nothing raises a banner for you.** If your game wants one, ask for it:

```js
kwShowBanner('menu');
```

The plugin owns the banner view and its position — there is no layout to
reserve, no element to style, and nothing to position.

### What `kwShowBanner()` actually does

Two separate things:

1. Tells the SDK to **start loading** a banner, if it doesn't already have one.
2. Makes any banner it **already has** visible.

The resolved value only reports the second part — whether one was already loaded
and so appeared immediately.

| `reason` | `shown` | Meaning | What to do |
| --- | --- | --- | --- |
| `'shown'` | `true` | A banner is on screen now | Nothing |
| `'pending'` | `false` | A load is under way; the banner will appear when it completes | **Nothing.** Don't poll or retry |
| `'failed'` | `false` | Plugin unavailable (preview, ads-disabled build) | Nothing |
| `'disabled'` | `false` | `kwAdPolicy.bannersEnabled` is `false` | Nothing |

`'pending'` is the normal result on a cold start. **Do not poll or retry** — a
retry loop achieves nothing except wasted calls.

To react to the banner actually appearing:

```js
window.addEventListener('kw:ad-event', function (e) {
    if (e.detail.type === 'banner' && e.detail.event === 'shown') {
        // A banner is now on screen.
    }
});
```

### Hiding it

Hide around anything that needs the full screen, then show it again:

```js
kwHideBanner();           // cutscene starts
// ...
kwShowBanner('gameplay'); // cutscene ends
```

`kwHideBanner()` keeps the loaded ad so re-showing is instant.
`kwDestroyBanner()` releases it — worth doing only if you're finished with
banners for a while, since the next `kwShowBanner()` then has to load from
scratch.

> **A note on how hide works.** The mediation SDK's hide is not durable on its
> own: it sets the current banner view to invisible but stores no flag, so the
> next banner to load — which, with auto-refresh on, is roughly every 30 seconds
> — would be added back at full visibility and pop up over your cutscene.
> `shared.js` compensates by remembering whether *you* want a banner and
> re-hiding any that reappears while you don't. You don't have to do anything
> about this; it's just why a banner may flicker for a frame during a long hide.


---

## Cooldowns are yours

`shared.js` applies none. A reasonable starting pattern:

```js
var lastInterstitialAt = 0;
var levelsSinceAd      = 0;
var levelEnds          = 0;

var GRACE_LEVELS  = 2;            // don't interrupt onboarding
var LEVELS_BETWEEN = 2;
var MIN_GAP_MS     = 60 * 1000;

function maybeShowInterstitial(context) {
    levelEnds++;
    levelsSinceAd++;

    if (levelEnds <= GRACE_LEVELS)                      return Promise.resolve(false);
    if (levelsSinceAd < LEVELS_BETWEEN)                 return Promise.resolve(false);
    if (Date.now() - lastInterstitialAt < MIN_GAP_MS)   return Promise.resolve(false);

    return kwRequestInterstitial(context).then(function (result) {
        if (result.shown) {
            // Reset on SHOWN, not on request: a no-fill must not consume the
            // slot, or one unlucky request costs the player's next real ad.
            lastInterstitialAt = Date.now();
            levelsSinceAd = 0;
        }
        return result.shown;
    });
}
```

Two details worth copying:

- **Reset counters on `shown`, not on request.** Otherwise a no-fill silently
  burns the slot and your real ad rate drifts below what you configured.
- **Count "levels since the last ad shown"** rather than testing a modulo of a
  running total. With a modulo, a level end blocked by the time cooldown loses
  that slot entirely and waits for the next multiple; counting since the last
  shown ad self-corrects.

---

## Placeholders

`'not-available'` is common and normal — a cold start usually has nothing cached
for the first few seconds, and preview builds never do. If you want to fill that
gap, do it around the call:

```js
showPlaceholder();
kwRequestInterstitial('level_complete').then(function (result) {
    hidePlaceholder();
    if (!result.shown) {
        // Optional: your own house ad / cross-promo instead.
    }
    goToNextLevel();
});
```

Keep the placeholder short-lived and never make dismissing it a requirement. If
`kwRequestInterstitial` resolves immediately the player should barely see it.

---

## Turning formats off

Two kill switches, settable any time:

```js
window.kwAdPolicy.interstitialsEnabled = false;   // rewarded-only build
window.kwAdPolicy.bannersEnabled = false;
```

Requests for a disabled format short-circuit with `reason: 'disabled'` and never
reach the SDK.

---

## Analytics you get for free

Emitted automatically; you don't call these.

| Event | When |
| --- | --- |
| `ad_requested` | `kwRequestInterstitial()` / `kwShowBanner()` called and not short-circuited |
| `ad_shown` | Interstitial displayed; banner actually appeared on screen |
| `ad_unavailable` | Nothing to show |
| `ad_failed` | An ad broke |
| `reward_ad_requested` / `reward_ad_earned` / `reward_ad_declined` / `reward_ad_unavailable` / `reward_ad_failed` | Rewarded lifecycle |

Interstitial/banner events carry `ad_format` and `ad_context` (the string you
passed). Rewarded events carry `reward_context`.

---

## Wiring it into `template.html`

The template already has the rewarded path (`requestRewardedAd` →
`simulateRewardedAd`, driven from the debug menu). Interstitials and banners
follow the same three pieces.

### 1. The wrapper

Next to `requestRewardedAd`:

```js
function requestInterstitial(context){
    if (typeof window.kwRequestInterstitial === "function"){
        return window.kwRequestInterstitial(context);
    }
    return simulateInterstitial(context);
}
```

### 2. The simulator

Mirroring `simulateRewardedAd`, but with no reward and a close button that is
available immediately — an interstitial is dismissible, not earned. Reuse the
`#simAd` element. (`interstitialBody` is a new string; add it to
`translations.js` alongside the existing `rvBody`.)

```js
// Stand-in interstitial for non-native runs. Mirrors the real contract:
// resolves { shown, reason, context }.
function simulateInterstitial(context){
    return new Promise((resolve) => {
        let settled = false;

        const finish = (reason) => {
            if (settled) return;
            settled = true;
            simAd.classList.remove("show");
            simAdClose.onclick = null;
            resolve({ shown: reason === "shown", reason, context });
        };

        simAdCount.textContent = "";
        simAdBody.textContent = t("interstitialBody");
        simAd.classList.add("show");
        simAdClose.onclick = () => finish("shown");
    });
}
```

### 3. The call site — level flow

`onOverlayContinue()` is the natural beat: it runs when the player dismisses the
win/fail card, i.e. between levels.

```js
let interstitialInFlight = false;
let lastInterstitialAt   = 0;
let levelsSinceAd        = 0;
let levelEnds            = 0;

const GRACE_LEVELS   = 2;          // don't interrupt onboarding
const LEVELS_BETWEEN = 2;
const MIN_GAP_MS     = 60 * 1000;

function onOverlayContinue(){
    const won = overlayCard.classList.contains("win");

    levelEnds++;
    levelsSinceAd++;

    const eligible =
        !interstitialInFlight &&
        levelEnds > GRACE_LEVELS &&
        levelsSinceAd >= LEVELS_BETWEEN &&
        (Date.now() - lastInterstitialAt) >= MIN_GAP_MS;

    if (!eligible){
        if (won) level++;
        startGame();
        return;
    }

    interstitialInFlight = true;
    requestInterstitial(won ? "level_complete" : "level_failed")
        .then((result) => {
            if (result && result.shown){
                // Reset on SHOWN, not on request: a no-fill must not consume
                // the slot, or one unlucky request costs the next real ad.
                lastInterstitialAt = Date.now();
                levelsSinceAd = 0;
            }
        })
        .catch(() => {})
        .then(() => {
            // Runs after the ad is DISMISSED, or immediately if none showed.
            interstitialInFlight = false;
            if (won) level++;
            startGame();
        });
}
```

The key property: advancing the level happens in the final `.then()`, so it
happens **after** the ad closes — and still happens if no ad appeared at all.
Nothing about the ad can strand the player on the overlay.

### 4. Banner

If the game wants one, raise it when gameplay starts and drop it when it needs
the full screen:

```js
function showBanner(context){
    if (typeof window.kwShowBanner === "function"){
        return window.kwShowBanner(context);
    }
    return Promise.resolve({ shown: false, reason: "failed", context });
}

function hideBanner(){
    if (typeof window.kwHideBanner === "function") return window.kwHideBanner();
    return Promise.resolve(false);
}
```

Then call `showBanner("gameplay")` in `startGame()` and `hideBanner()` before
any full-screen moment. If the game has no room for a banner, simply never call
it — nothing raises one on its own.

---


| # | Gotcha |
| --- | --- |
| 1 | **Declare the stubs as `window.x = window.x \|\| ...`.** A `function` declaration silently kills ads in every build while looking fine in preview. |
| 2 | **The interstitial promise resolves on dismissal.** Don't also listen for a close event; you'll double-fire. |
| 3 | **Never block progression on an ad.** Every reason except `'shown'` means "carry on". |
| 4 | **Gate rewards on `result.earned`,** never on the promise resolving — `'declined'` resolves too. |
| 5 | **Don't retry on `'busy'` in a loop.** It means a fullscreen ad is already up. |
| 6 | **Reset your cooldown on `shown`,** not on request. |
| 7 | **Don't request an interstitial straight after a rewarded.** The player just opted into one ad; back-to-back ads is the fastest way to make the reward feel like a trap. `'busy'` only protects you while the first is still on screen. |
| 8 | **`'pending'` means the banner is loading and will appear on its own.** Don't retry or poll. Use the `kw:ad-event` banner `'shown'` event if you need to know when it arrived. |
| 9 | **Banners need an explicit `kwShowBanner()` call.** Forgetting it is a silent no-op, not an error. |

