package com.chinmay.bachat

import android.app.Application
import com.chinmay.bachat.data.Alerts
import com.chinmay.bachat.data.Repo
import com.chinmay.bachat.data.Schedule

class BachatApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Repo.init(this)
        Alerts.createChannels(this)
        Schedule.apply(this, Repo.settings.value.intervalMinutes)
    }
}
