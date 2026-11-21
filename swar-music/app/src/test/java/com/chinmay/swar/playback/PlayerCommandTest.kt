package com.chinmay.swar.playback

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PlayerCommandTest {

    @Test
    fun buildsGuardedPageCalls() {
        assertEquals("window.__swar&&window.__swar.cmd&&window.__swar.cmd('play',null);", PlayerCommand.Play.js)
        assertEquals("window.__swar&&window.__swar.cmd&&window.__swar.cmd('prev',null);", PlayerCommand.Previous.js)
        assertEquals("window.__swar&&window.__swar.cmd&&window.__swar.cmd('seek',83.5);", PlayerCommand.SeekTo(83_500).js)
        assertEquals("window.__swar&&window.__swar.cmd&&window.__swar.cmd('seek',0.0);", PlayerCommand.SeekTo(-5).js)
        assertEquals("window.__swar&&window.__swar.cmd&&window.__swar.cmd('background',null);", PlayerCommand.EnterBackground.js)
        assertEquals("window.__swar&&window.__swar.cmd&&window.__swar.cmd('foreground',null);", PlayerCommand.ReturnToForeground.js)
    }

    @Test
    fun artworkOnlyFromGoogleImageHosts() {
        assertTrue(Artwork.isTrustedUrl("https://lh3.googleusercontent.com/abc=w544-h544-l90-rj"))
        assertTrue(Artwork.isTrustedUrl("https://i.ytimg.com/vi/abc/sddefault.jpg"))
        assertFalse(Artwork.isTrustedUrl("http://i.ytimg.com/vi/abc/sddefault.jpg"))
        assertFalse(Artwork.isTrustedUrl("https://ytimg.com.example.net/a.jpg"))
        assertFalse(Artwork.isTrustedUrl("https://192.168.1.1/a.jpg"))
    }
}
