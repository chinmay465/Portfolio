package com.chinmay.prahari.net

/**
 * Servers that only exist to collect data from apps: analytics, attribution,
 * ads, session replay and crash reporting. A lookup of one of these by an app
 * means that app is about to send it something.
 */
object TrackerDomains {

    data class Tracker(val company: String, val what: String)

    private fun t(company: String, what: String) = Tracker(company, what)

    private val GOOGLE_ANALYTICS = t("Google Analytics for Firebase", "analytics")
    private val GOOGLE_ADS = t("Google Ads", "ads")
    private val CRASHLYTICS = t("Firebase Crashlytics", "crash reports")
    private val META = t("Meta", "analytics & ads")

    private val SUFFIXES: Map<String, Tracker> = mapOf(
        "app-measurement.com" to GOOGLE_ANALYTICS,
        "firebaselogging-pa.googleapis.com" to GOOGLE_ANALYTICS,
        "firebase-settings.crashlytics.com" to CRASHLYTICS,
        "crashlyticsreports-pa.googleapis.com" to CRASHLYTICS,
        "crashlytics.com" to CRASHLYTICS,
        "google-analytics.com" to t("Google Analytics", "analytics"),
        "doubleclick.net" to GOOGLE_ADS,
        "googlesyndication.com" to GOOGLE_ADS,
        "googleadservices.com" to GOOGLE_ADS,
        "googletagmanager.com" to t("Google Tag Manager", "analytics"),
        "graph.facebook.com" to META,
        "graph.instagram.com" to META,
        "connect.facebook.net" to META,
        "an.facebook.com" to t("Meta Audience Network", "ads"),
        "appsflyer.com" to t("AppsFlyer", "attribution"),
        "appsflyersdk.com" to t("AppsFlyer", "attribution"),
        "adjust.com" to t("Adjust", "attribution"),
        "adjust.net.in" to t("Adjust", "attribution"),
        "adj.st" to t("Adjust", "attribution"),
        "branch.io" to t("Branch", "attribution"),
        "app.link" to t("Branch", "attribution"),
        "kochava.com" to t("Kochava", "attribution"),
        "singular.net" to t("Singular", "attribution"),
        "sng.link" to t("Singular", "attribution"),
        "mixpanel.com" to t("Mixpanel", "analytics"),
        "amplitude.com" to t("Amplitude", "analytics"),
        "segment.io" to t("Segment", "analytics"),
        "segment.com" to t("Segment", "analytics"),
        "flurry.com" to t("Flurry", "analytics"),
        "appmetrica.yandex.net" to t("Yandex AppMetrica", "analytics"),
        "appmetrica.yandex.com" to t("Yandex AppMetrica", "analytics"),
        "umeng.com" to t("Umeng", "analytics"),
        "heapanalytics.com" to t("Heap", "analytics"),
        "posthog.com" to t("PostHog", "analytics"),
        "in.appcenter.ms" to t("App Center", "analytics"),
        "scorecardresearch.com" to t("comScore", "analytics"),
        "clevertap-prod.com" to t("CleverTap", "marketing"),
        "wzrkt.com" to t("CleverTap", "marketing"),
        "moengage.com" to t("MoEngage", "marketing"),
        "webengage.com" to t("WebEngage", "marketing"),
        "webengage.co" to t("WebEngage", "marketing"),
        "netcoresmartech.com" to t("Netcore Smartech", "marketing"),
        "onesignal.com" to t("OneSignal", "marketing"),
        "braze.com" to t("Braze", "marketing"),
        "appboy.com" to t("Braze", "marketing"),
        "leanplum.com" to t("Leanplum", "marketing"),
        "useinsider.com" to t("Insider", "marketing"),
        "uxcam.com" to t("UXCam", "session replay"),
        "smartlook.com" to t("Smartlook", "session replay"),
        "smartlook.cloud" to t("Smartlook", "session replay"),
        "fullstory.com" to t("FullStory", "session replay"),
        "clarity.ms" to t("Microsoft Clarity", "session replay"),
        "contentsquare.net" to t("Contentsquare", "session replay"),
        "quantummetric.com" to t("Quantum Metric", "session replay"),
        "logrocket.io" to t("LogRocket", "session replay"),
        "lr-ingest.io" to t("LogRocket", "session replay"),
        "lr-in.com" to t("LogRocket", "session replay"),
        "userexperior.com" to t("UserExperior", "session replay"),
        "userexperior.online" to t("UserExperior", "session replay"),
        "hotjar.com" to t("Hotjar", "session replay"),
        "sentry.io" to t("Sentry", "crash reports"),
        "bugsnag.com" to t("Bugsnag", "crash reports"),
        "instabug.com" to t("Instabug", "crash reports"),
        "newrelic.com" to t("New Relic", "performance"),
        "nr-data.net" to t("New Relic", "performance"),
        "datadoghq.com" to t("Datadog", "performance"),
        "datadoghq.eu" to t("Datadog", "performance"),
        "appdynamics.com" to t("AppDynamics", "performance"),
        "dynatrace.com" to t("Dynatrace", "performance"),
        "applovin.com" to t("AppLovin", "ads"),
        "applvn.com" to t("AppLovin", "ads"),
        "unityads.unity3d.com" to t("Unity Ads", "ads"),
        "ironsrc.com" to t("ironSource", "ads"),
        "ironsrc.mobi" to t("ironSource", "ads"),
        "inmobi.com" to t("InMobi", "ads"),
        "vungle.com" to t("Liftoff Vungle", "ads"),
        "chartboost.com" to t("Chartboost", "ads"),
        "rayjump.com" to t("Mintegral", "ads"),
        "mintegral.com" to t("Mintegral", "ads"),
        "pangle.io" to t("Pangle", "ads"),
        "pangleglobal.com" to t("Pangle", "ads"),
        "startappservice.com" to t("Start.io", "ads"),
        "adcolony.com" to t("AdColony", "ads"),
        "smaato.net" to t("Smaato", "ads"),
        "amazon-adsystem.com" to t("Amazon Ads", "ads"),
        "taboola.com" to t("Taboola", "ads"),
        "outbrain.com" to t("Outbrain", "ads"),
        "criteo.com" to t("Criteo", "ads"),
        "criteo.net" to t("Criteo", "ads"),
        "adsrvr.org" to t("The Trade Desk", "ads"),
        "radar.io" to t("Radar", "location data"),
        "foursquare.com" to t("Foursquare", "location data"),
        "huq.io" to t("Huq", "location data"),
        "cuebiq.com" to t("Cuebiq", "location data"),
        "tutelatechnologies.com" to t("Tutela", "location data"),
        "online-metrix.net" to t("ThreatMetrix", "fingerprinting"),
        "fpjs.io" to t("Fingerprint", "fingerprinting"),
    )

    /** The tracker behind [domain] (or any parent domain of it), if known. */
    fun lookup(domain: String): Tracker? {
        var d = domain.lowercase().trimEnd('.')
        while (true) {
            SUFFIXES[d]?.let { return it }
            val dot = d.indexOf('.')
            if (dot < 0 || dot == d.length - 1) return null
            d = d.substring(dot + 1)
            if (!d.contains('.')) return null // never match a bare TLD
        }
    }

    fun label(domain: String): String? = lookup(domain)?.let { "${it.company} (${it.what})" }
}
