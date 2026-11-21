package com.chinmay.swar.web

import com.chinmay.swar.web.NavPolicy.Action
import org.junit.Assert.assertEquals
import org.junit.Test

class NavPolicyTest {

    @Test
    fun keepsYoutubeMusicAndSignInInApp() {
        assertEquals(Action.IN_APP, NavPolicy.decide("https://music.youtube.com/watch?v=abc"))
        assertEquals(Action.IN_APP, NavPolicy.decide("https://accounts.google.com/ServiceLogin?service=youtube"))
        assertEquals(Action.IN_APP, NavPolicy.decide("https://accounts.google.co.in/accounts/SetSID"))
        assertEquals(Action.IN_APP, NavPolicy.decide("https://www.youtube.com/signin?action_handle_signin=true"))
        assertEquals(Action.IN_APP, NavPolicy.decide("https://consent.youtube.com/m?continue=x"))
    }

    @Test
    fun opensOtherSitesOutside() {
        assertEquals(Action.EXTERNAL, NavPolicy.decide("https://en.wikipedia.org/wiki/Raga"))
        assertEquals(Action.EXTERNAL, NavPolicy.decide("mailto:someone@example.com"))
        assertEquals(Action.EXTERNAL, NavPolicy.decide("https://youtube.com.evil.example/"))
    }

    @Test
    fun blocksOpenTheAppLinks() {
        assertEquals(Action.BLOCK, NavPolicy.decide("intent://music.youtube.com/#Intent;package=com.google.android.apps.youtube.music;end"))
        assertEquals(Action.BLOCK, NavPolicy.decide("vnd.youtube:abc"))
        assertEquals(Action.BLOCK, NavPolicy.decide("market://details?id=com.google.android.apps.youtube.music"))
        assertEquals(Action.BLOCK, NavPolicy.decide("javascript:alert(1)"))
    }
}
