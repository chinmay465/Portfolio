package com.chinmay.swar

import android.app.Application
import coil.ImageLoader
import coil.ImageLoaderFactory
import com.chinmay.swar.data.YtMusic
import com.chinmay.swar.playback.Streams

class SwarApp : Application(), ImageLoaderFactory {
    override fun onCreate() {
        super.onCreate()
        CrashLog.install(this)
        YtMusic.init(this)
        Streams.init(this, YtMusic.http)
    }

    /** Album art over the same HTTP client, with a short fade-in. */
    override fun newImageLoader(): ImageLoader = ImageLoader.Builder(this)
        .okHttpClient(YtMusic.http)
        .crossfade(true)
        .respectCacheHeaders(false)
        .build()
}
