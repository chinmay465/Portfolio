package com.chinmay.prahari.apps

/** A permission group in plain words. */
enum class Perm(val label: String, val sensitive: Int) {
    CAMERA("Camera", 5),
    MIC("Microphone", 6),
    LOCATION_PRECISE("Precise location", 4),
    LOCATION_APPROX("Approximate location", 2),
    LOCATION_BACKGROUND("Location all the time", 12),
    CONTACTS("Contacts", 6),
    CALL_LOG("Call logs", 8),
    SMS("SMS", 10),
    PHONE("Phone", 3),
    CALENDAR("Calendar", 3),
    SENSORS("Body sensors", 4),
    ACTIVITY("Physical activity", 2),
    MEDIA("Photos, videos & audio", 3),
    FILES_ALL("All files", 8),
    NEARBY("Nearby devices", 2),
    ACCOUNTS("Accounts on the phone", 3),
    OVERLAY("Draw over other apps", 4),
    USAGE("See what apps you use", 6),
    INSTALL("Install other apps", 4),
    ALL_APPS("See all your installed apps", 2),
    NOTIFICATIONS("Notifications", 0),
}

/** How an app can see what you type or what is on screen. */
data class Exposure(
    /** An enabled accessibility service. */
    val accessibility: Boolean = false,
    /** …that can read window contents (text on screen and in fields). */
    val readsScreen: Boolean = false,
    /** …that can intercept key events. */
    val filtersKeys: Boolean = false,
    /** An enabled keyboard (input method). */
    val keyboard: Boolean = false,
    val defaultKeyboard: Boolean = false,
    /** Reads every notification (messages, OTPs). */
    val notifications: Boolean = false,
    val deviceAdmin: Boolean = false,
    /** The autofill service: sees forms you fill, including passwords. */
    val autofill: Boolean = false,
    /** The assistant / voice interaction app (can read the screen on request). */
    val assistant: Boolean = false,
) {
    val any get() = accessibility || keyboard || notifications || deviceAdmin || autofill || assistant
}
