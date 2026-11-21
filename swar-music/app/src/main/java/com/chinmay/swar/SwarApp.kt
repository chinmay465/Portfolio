package com.chinmay.swar

import android.app.Application

class SwarApp : Application() {
    override fun onCreate() {
        super.onCreate()
        CrashLog.install(this)
    }
}
