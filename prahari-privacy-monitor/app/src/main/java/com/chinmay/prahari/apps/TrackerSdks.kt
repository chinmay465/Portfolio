package com.chinmay.prahari.apps

/**
 * Third-party SDKs that collect data inside the apps that embed them, keyed by
 * the Java package their code lives in. Found by reading the class names in
 * each app's dex files (the same idea as Exodus Privacy), entirely on-device.
 */
object TrackerSdks {

    enum class Category(val label: String, val explain: String, val weight: Int) {
        SESSION_REPLAY(
            "Session replay",
            "Records the screens you see and the taps, scrolls and often the text you type, and uploads them so the company can replay your session.",
            20,
        ),
        LOCATION_DATA(
            "Location data",
            "Collects your location in the background and is known for selling or sharing location data with third parties.",
            15,
        ),
        FINGERPRINT(
            "Device fingerprinting",
            "Builds a unique fingerprint of your phone (hardware, settings, installed apps) that follows you even after a reset.",
            8,
        ),
        ATTRIBUTION(
            "Install attribution",
            "Tells ad networks which ad made you install or open the app, sharing your advertising ID and in-app events.",
            4,
        ),
        ADS("Advertising", "Shows ads and shares device data and your advertising ID with ad networks for targeting.", 3),
        MARKETING("Marketing & engagement", "Logs what you do in the app to build a profile used for push, SMS and email campaigns.", 3),
        ANALYTICS("Analytics", "Logs screens you open, buttons you press and events like searches, and sends them to an analytics server.", 2),
        CRASH("Crash & performance", "Sends crash reports and performance traces. Usually benign, but reports can include what was on screen.", 1),
    }

    data class Sdk(val id: String, val name: String, val category: Category, val prefixes: List<String>)

    private fun sdk(id: String, name: String, c: Category, vararg prefixes: String) = Sdk(id, name, c, prefixes.toList())

    val ALL: List<Sdk> = listOf(
        // Session replay: the closest thing to "it records what I type".
        sdk("uxcam", "UXCam", Category.SESSION_REPLAY, "Lcom/uxcam/"),
        sdk("smartlook", "Smartlook", Category.SESSION_REPLAY, "Lcom/smartlook/"),
        sdk("fullstory", "FullStory", Category.SESSION_REPLAY, "Lcom/fullstory/"),
        sdk("contentsquare", "Contentsquare", Category.SESSION_REPLAY, "Lcom/contentsquare/"),
        sdk("quantummetric", "Quantum Metric", Category.SESSION_REPLAY, "Lcom/quantummetric/"),
        sdk("glassbox", "Glassbox", Category.SESSION_REPLAY, "Lcom/glassbox/"),
        sdk("logrocket", "LogRocket", Category.SESSION_REPLAY, "Lcom/logrocket/"),
        sdk("clarity", "Microsoft Clarity", Category.SESSION_REPLAY, "Lcom/microsoft/clarity/"),
        sdk("userexperior", "UserExperior", Category.SESSION_REPLAY, "Lcom/userexperior/"),
        sdk("appsee", "Appsee", Category.SESSION_REPLAY, "Lcom/appsee/"),
        sdk("sentry_replay", "Sentry Session Replay", Category.SESSION_REPLAY, "Lio/sentry/android/replay/"),
        sdk("datadog_replay", "Datadog Session Replay", Category.SESSION_REPLAY, "Lcom/datadog/android/sessionreplay/"),
        sdk("posthog_replay", "PostHog Session Replay", Category.SESSION_REPLAY, "Lcom/posthog/android/replay/"),
        sdk("dynatrace_replay", "Dynatrace Session Replay", Category.SESSION_REPLAY, "Lcom/dynatrace/android/sessionreplay/"),

        // Location data brokers and network-measurement SDKs.
        sdk("radar", "Radar", Category.LOCATION_DATA, "Lio/radar/sdk/"),
        sdk("foursquare", "Foursquare Movement", Category.LOCATION_DATA, "Lcom/foursquare/pilgrim/", "Lcom/foursquare/movement/"),
        sdk("huq", "Huq", Category.LOCATION_DATA, "Lio/huq/"),
        sdk("cuebiq", "Cuebiq", Category.LOCATION_DATA, "Lcom/cuebiq/"),
        sdk("xmode", "X-Mode", Category.LOCATION_DATA, "Lio/xmode/"),
        sdk("tutela", "Tutela", Category.LOCATION_DATA, "Lcom/tutelatechnologies/"),
        sdk("opensignal", "Opensignal", Category.LOCATION_DATA, "Lcom/opensignal/"),
        sdk("gimbal", "Gimbal", Category.LOCATION_DATA, "Lcom/gimbal/"),
        sdk("inmarket", "inMarket", Category.LOCATION_DATA, "Lcom/inmarket/"),
        sdk("teemo", "Teemo", Category.LOCATION_DATA, "Lcom/databerries/"),

        // Fingerprinting (often used for fraud checks in banking and payments).
        sdk("threatmetrix", "ThreatMetrix", Category.FINGERPRINT, "Lcom/threatmetrix/", "Lcom/lexisnexisrisk/threatmetrix/"),
        sdk("fingerprintjs", "Fingerprint", Category.FINGERPRINT, "Lcom/fingerprintjs/"),
        sdk("seon", "SEON", Category.FINGERPRINT, "Lio/seon/"),
        sdk("incognia", "Incognia", Category.FINGERPRINT, "Lcom/incognia/"),
        sdk("sardine", "Sardine", Category.FINGERPRINT, "Lai/sardine/"),
        sdk("bureau", "Bureau", Category.FINGERPRINT, "Lid/bureau/"),

        // Install attribution.
        sdk("appsflyer", "AppsFlyer", Category.ATTRIBUTION, "Lcom/appsflyer/"),
        sdk("adjust", "Adjust", Category.ATTRIBUTION, "Lcom/adjust/sdk/"),
        sdk("branch", "Branch", Category.ATTRIBUTION, "Lio/branch/"),
        sdk("kochava", "Kochava", Category.ATTRIBUTION, "Lcom/kochava/"),
        sdk("singular", "Singular", Category.ATTRIBUTION, "Lcom/singular/sdk/"),
        sdk("tenjin", "Tenjin", Category.ATTRIBUTION, "Lcom/tenjin/"),
        sdk("airbridge", "Airbridge", Category.ATTRIBUTION, "Lco/ab180/airbridge/"),

        // Advertising.
        sdk("admob", "Google AdMob", Category.ADS, "Lcom/google/android/gms/ads/"),
        sdk("ima", "Google IMA (video ads)", Category.ADS, "Lcom/google/ads/interactivemedia/"),
        sdk("fan", "Meta Audience Network", Category.ADS, "Lcom/facebook/ads/"),
        sdk("applovin", "AppLovin", Category.ADS, "Lcom/applovin/"),
        sdk("unityads", "Unity Ads", Category.ADS, "Lcom/unity3d/ads/", "Lcom/unity3d/services/"),
        sdk("ironsource", "ironSource", Category.ADS, "Lcom/ironsource/"),
        sdk("inmobi", "InMobi", Category.ADS, "Lcom/inmobi/"),
        sdk("vungle", "Liftoff Vungle", Category.ADS, "Lcom/vungle/"),
        sdk("chartboost", "Chartboost", Category.ADS, "Lcom/chartboost/"),
        sdk("mintegral", "Mintegral", Category.ADS, "Lcom/mbridge/msdk/"),
        sdk("pangle", "Pangle (ByteDance)", Category.ADS, "Lcom/bytedance/sdk/openadsdk/"),
        sdk("startio", "Start.io", Category.ADS, "Lcom/startapp/"),
        sdk("mopub", "MoPub", Category.ADS, "Lcom/mopub/"),
        sdk("adcolony", "AdColony", Category.ADS, "Lcom/adcolony/"),
        sdk("smaato", "Smaato", Category.ADS, "Lcom/smaato/"),
        sdk("amazonads", "Amazon Ads", Category.ADS, "Lcom/amazon/device/ads/"),
        sdk("yandexads", "Yandex Ads", Category.ADS, "Lcom/yandex/mobile/ads/"),
        sdk("taboola", "Taboola", Category.ADS, "Lcom/taboola/"),
        sdk("outbrain", "Outbrain", Category.ADS, "Lcom/outbrain/"),
        sdk("criteo", "Criteo", Category.ADS, "Lcom/criteo/"),
        sdk("huaweiads", "Huawei Ads", Category.ADS, "Lcom/huawei/hms/ads/"),
        sdk("fyber", "Digital Turbine / Fyber", Category.ADS, "Lcom/fyber/"),

        // Marketing and engagement (very common in Indian fintech and shopping apps).
        sdk("clevertap", "CleverTap", Category.MARKETING, "Lcom/clevertap/"),
        sdk("moengage", "MoEngage", Category.MARKETING, "Lcom/moengage/"),
        sdk("webengage", "WebEngage", Category.MARKETING, "Lcom/webengage/"),
        sdk("netcore", "Netcore Smartech", Category.MARKETING, "Lcom/netcore/android/"),
        sdk("braze", "Braze", Category.MARKETING, "Lcom/braze/", "Lcom/appboy/"),
        sdk("onesignal", "OneSignal", Category.MARKETING, "Lcom/onesignal/"),
        sdk("leanplum", "Leanplum", Category.MARKETING, "Lcom/leanplum/"),
        sdk("airship", "Airship", Category.MARKETING, "Lcom/urbanairship/"),
        sdk("iterable", "Iterable", Category.MARKETING, "Lcom/iterable/"),
        sdk("insider", "Insider", Category.MARKETING, "Lcom/useinsider/"),
        sdk("plotline", "Plotline", Category.MARKETING, "Lso/plotline/"),
        sdk("customerio", "Customer.io", Category.MARKETING, "Lio/customer/"),
        sdk("batch", "Batch", Category.MARKETING, "Lcom/batch/android/"),

        // Analytics.
        sdk("firebase_analytics", "Google Analytics for Firebase", Category.ANALYTICS, "Lcom/google/firebase/analytics/", "Lcom/google/android/gms/measurement/"),
        sdk("google_analytics", "Google Analytics", Category.ANALYTICS, "Lcom/google/android/gms/analytics/"),
        sdk("fb_appevents", "Meta App Events", Category.ANALYTICS, "Lcom/facebook/appevents/"),
        sdk("amplitude", "Amplitude", Category.ANALYTICS, "Lcom/amplitude/"),
        sdk("mixpanel", "Mixpanel", Category.ANALYTICS, "Lcom/mixpanel/"),
        sdk("segment", "Segment", Category.ANALYTICS, "Lcom/segment/analytics/"),
        sdk("flurry", "Flurry", Category.ANALYTICS, "Lcom/flurry/"),
        sdk("appmetrica", "Yandex AppMetrica", Category.ANALYTICS, "Lcom/yandex/metrica/", "Lio/appmetrica/"),
        sdk("umeng", "Umeng", Category.ANALYTICS, "Lcom/umeng/"),
        sdk("heap", "Heap", Category.ANALYTICS, "Lcom/heapanalytics/", "Lio/heap/"),
        sdk("posthog", "PostHog", Category.ANALYTICS, "Lcom/posthog/"),
        sdk("appcenter_analytics", "App Center Analytics", Category.ANALYTICS, "Lcom/microsoft/appcenter/analytics/"),
        sdk("huawei_analytics", "Huawei Analytics", Category.ANALYTICS, "Lcom/huawei/hms/analytics/"),
        sdk("comscore", "comScore", Category.ANALYTICS, "Lcom/comscore/"),
        sdk("adobe", "Adobe Experience", Category.ANALYTICS, "Lcom/adobe/marketing/mobile/"),
        sdk("snowplow", "Snowplow", Category.ANALYTICS, "Lcom/snowplowanalytics/"),
        sdk("localytics", "Localytics", Category.ANALYTICS, "Lcom/localytics/"),
        sdk("countly", "Countly", Category.ANALYTICS, "Lly/count/"),

        // Crash and performance reporting.
        sdk("crashlytics", "Firebase Crashlytics", Category.CRASH, "Lcom/google/firebase/crashlytics/", "Lcom/crashlytics/"),
        sdk("firebase_perf", "Firebase Performance", Category.CRASH, "Lcom/google/firebase/perf/"),
        sdk("sentry", "Sentry", Category.CRASH, "Lio/sentry/"),
        sdk("bugsnag", "Bugsnag", Category.CRASH, "Lcom/bugsnag/"),
        sdk("instabug", "Instabug", Category.CRASH, "Lcom/instabug/"),
        sdk("newrelic", "New Relic", Category.CRASH, "Lcom/newrelic/agent/"),
        sdk("datadog", "Datadog", Category.CRASH, "Lcom/datadog/android/"),
        sdk("appdynamics", "AppDynamics", Category.CRASH, "Lcom/appdynamics/"),
        sdk("dynatrace", "Dynatrace", Category.CRASH, "Lcom/dynatrace/"),
        sdk("embrace", "Embrace", Category.CRASH, "Lio/embrace/"),
        sdk("appcenter_crashes", "App Center Crashes", Category.CRASH, "Lcom/microsoft/appcenter/crashes/"),
    )

    private val byId = ALL.associateBy { it.id }
    fun of(id: String): Sdk? = byId[id]

    private val byPrefix: Map<String, Sdk> = buildMap { ALL.forEach { s -> s.prefixes.forEach { put(it, s) } } }
    private val maxDepth = byPrefix.keys.maxOf { p -> p.count { it == '/' } }

    /** The SDK a class descriptor like `Lcom/appsflyer/AppsFlyerLib;` belongs to, if any. */
    fun match(descriptor: String): Sdk? {
        if (descriptor.length < 4 || descriptor[0] != 'L') return null
        var best: Sdk? = null
        var slash = descriptor.indexOf('/')
        var depth = 1
        while (slash > 0 && depth <= maxDepth) {
            byPrefix[descriptor.substring(0, slash + 1)]?.let { best = it } // deepest match wins
            slash = descriptor.indexOf('/', slash + 1)
            depth++
        }
        return best
    }

    /** Stored ids back to SDKs, most invasive first. */
    fun resolve(ids: Collection<String>): List<Sdk> =
        ids.mapNotNull { of(it) }.distinct()
            .sortedWith(compareByDescending<Sdk> { it.category.weight }.thenBy { it.name })
}
