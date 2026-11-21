plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// CI builds get an ever-increasing versionCode so each APK installs as an update.
val ciRunNumber = System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull() ?: 0

// Permanent signing key, provided by CI from repo secrets. Every APK signed with
// it installs over the previous one. Without it (local builds, forks) the build
// falls back to the machine's debug key.
val keystorePath: String? = System.getenv("KAVACH_KEYSTORE_PATH")?.takeIf { it.isNotBlank() }

android {
    namespace = "com.chinmay.kavach"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.chinmay.kavach"
        minSdk = 26
        targetSdk = 35
        versionCode = 1000 + ciRunNumber
        versionName = "1.1.$ciRunNumber"
    }

    signingConfigs {
        if (keystorePath != null) {
            create("kavach") {
                storeFile = file(keystorePath)
                storePassword = System.getenv("KAVACH_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("KAVACH_KEY_ALIAS")?.takeIf { it.isNotBlank() } ?: "kavach"
                keyPassword = System.getenv("KAVACH_KEY_PASSWORD")?.takeIf { it.isNotBlank() }
                    ?: System.getenv("KAVACH_KEYSTORE_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("kavach") ?: signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        viewBinding = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")

    testImplementation("junit:junit:4.13.2")
}
