pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        // NewPipe Extractor (the YouTube stream engine) and its nanojson are published here.
        maven("https://jitpack.io")
    }
}

rootProject.name = "Swar"
include(":app")
