package com.chinmay.swar.data

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Fixtures follow the shape of real WEB_REMIX responses, trimmed to what Swar reads. */
class ParserTest {

    private fun runs(vararg parts: String) = """{"runs":[${parts.joinToString(",")}]}"""
    private fun plain(t: String) = """{"text":"$t"}"""
    private fun link(t: String, id: String, type: String) =
        """{"text":"$t","navigationEndpoint":{"browseEndpoint":{"browseId":"$id","browseEndpointContextSupportedConfigs":{"browseEndpointContextMusicConfig":{"pageType":"$type"}}}}}"""
    private val dot = plain(" • ")
    private fun thumbs(url: String, w: Int = 60) = """{"musicThumbnailRenderer":{"thumbnail":{"thumbnails":[{"url":"$url","width":$w,"height":$w}]}}}"""

    private fun songRow(id: String, title: String, vararg detail: String, type: String = "MUSIC_VIDEO_TYPE_ATV") = """
        {"musicResponsiveListItemRenderer":{
          "thumbnail":${thumbs("https://lh3.googleusercontent.com/abc=w60-h60-l90-rj")},
          "overlay":{"musicItemThumbnailOverlayRenderer":{"content":{"musicPlayButtonRenderer":{"playNavigationEndpoint":{"watchEndpoint":{"videoId":"$id","watchEndpointMusicSupportedConfigs":{"watchEndpointMusicConfig":{"musicVideoType":"$type"}}}}}}}},
          "flexColumns":[
            {"musicResponsiveListItemFlexColumnRenderer":{"text":{"runs":[{"text":"$title","navigationEndpoint":{"watchEndpoint":{"videoId":"$id"}}}]}}},
            {"musicResponsiveListItemFlexColumnRenderer":{"text":${runs(*detail)}}}
          ]}}"""

    @Test
    fun searchTopResultAndSongs() {
        val json = JSONObject("""
        {"contents":{"tabbedSearchResultsRenderer":{"tabs":[{"tabRenderer":{"content":{"sectionListRenderer":{"contents":[
          {"musicCardShelfRenderer":{
            "header":{"musicCardShelfHeaderBasicRenderer":{"title":${runs(plain("Top result"))}}},
            "title":{"runs":[{"text":"Kesariya","navigationEndpoint":{"watchEndpoint":{"videoId":"BddP6PYo2gs","watchEndpointMusicSupportedConfigs":{"watchEndpointMusicConfig":{"musicVideoType":"MUSIC_VIDEO_TYPE_OMV"}}}}}]},
            "subtitle":${runs(plain("Video"), dot, link("Pritam", "UC1", "MUSIC_PAGE_TYPE_ARTIST"), plain(" & "), link("Arijit Singh", "UC2", "MUSIC_PAGE_TYPE_ARTIST"), dot, plain("4:28"))},
            "thumbnail":${thumbs("https://i.ytimg.com/vi/BddP6PYo2gs/sddefault.jpg", 640)},
            "contents":[${songRow("song1", "Kesariya (From \\\"Brahmastra\\\")", link("Pritam", "UC1", "MUSIC_PAGE_TYPE_ARTIST"), dot, link("Brahmastra", "MPREb_1", "MUSIC_PAGE_TYPE_ALBUM"), dot, plain("4:28"))}]
          }},
          {"musicShelfRenderer":{"title":${runs(plain("Songs"))},"contents":[
            ${songRow("song2", "Apna Bana Le", plain("Song"), dot, link("Sachin-Jigar", "UC3", "MUSIC_PAGE_TYPE_ARTIST"), dot, link("Bhediya", "MPREb_2", "MUSIC_PAGE_TYPE_ALBUM"), dot, plain("4:21"))}
          ]}}
        ]}}}}]}}}""")
        val sections = Parser.sections(json.opt("contents"))
        assertEquals(listOf("Top result", "Songs"), sections.map { it.title })

        val top = sections[0].items[0] as Song
        assertEquals("BddP6PYo2gs", top.videoId)
        assertTrue(top.isVideo)
        assertEquals(listOf("Pritam", "Arijit Singh"), top.artists.map { it.name })
        assertEquals(268, top.durationSec)

        val inCard = sections[0].items[1] as Song
        assertEquals(Ref("Brahmastra", "MPREb_1"), inCard.album)
        assertEquals("https://lh3.googleusercontent.com/abc=w544-h544-l90-rj", inCard.thumbnail)

        val song = sections[1].items[0] as Song
        assertEquals("song2", song.videoId)
        assertEquals(Song.ATV, song.videoType)
        assertEquals("Sachin-Jigar", song.artistText)
        assertEquals("Bhediya", song.album?.name)
        assertEquals(261, song.durationSec)
    }

    @Test
    fun homeCarouselsQuickPicksChipsAndContinuation() {
        val json = JSONObject("""
        {"contents":{"singleColumnBrowseResultsRenderer":{"tabs":[{"tabRenderer":{"content":{"sectionListRenderer":{
          "header":{"chipCloudRenderer":{"chips":[
            {"chipCloudChipRenderer":{"text":${runs(plain("Relax"))},"navigationEndpoint":{"browseEndpoint":{"browseId":"FEmusic_home","params":"relaxP"}}}}
          ]}},
          "contents":[
            {"musicCarouselShelfRenderer":{
              "header":{"musicCarouselShelfBasicHeaderRenderer":{"title":${runs(plain("Quick picks"))},"strapline":${runs(plain("Start radio from a song"))}}},
              "contents":[${songRow("qp1", "Tum Hi Ho", link("Arijit Singh", "UC2", "MUSIC_PAGE_TYPE_ARTIST"), dot, plain("120M plays"))}]}},
            {"musicCarouselShelfRenderer":{
              "header":{"musicCarouselShelfBasicHeaderRenderer":{"title":${runs(plain("Albums for you"))},
                "moreContentButton":{"buttonRenderer":{"navigationEndpoint":{"browseEndpoint":{"browseId":"FEmusic_more","params":"m"}}}}}},
              "contents":[
                {"musicTwoRowItemRenderer":{
                  "title":{"runs":[${link("Animal", "MPREb_3", "MUSIC_PAGE_TYPE_ALBUM")}]},
                  "subtitle":${runs(plain("Album"), dot, plain("Various Artists"))},
                  "navigationEndpoint":{"browseEndpoint":{"browseId":"MPREb_3","browseEndpointContextSupportedConfigs":{"browseEndpointContextMusicConfig":{"pageType":"MUSIC_PAGE_TYPE_ALBUM"}}}},
                  "thumbnailRenderer":${thumbs("https://lh3.googleusercontent.com/alb=w226-h226")},
                  "thumbnailOverlay":{"musicItemThumbnailOverlayRenderer":{"content":{"musicPlayButtonRenderer":{"playNavigationEndpoint":{"watchPlaylistEndpoint":{"playlistId":"OLAK5uy_x"}}}}}}}},
                {"musicTwoRowItemRenderer":{
                  "title":${runs(plain("My Supermix"))},
                  "subtitle":${runs(plain("Mix"))},
                  "navigationEndpoint":{"watchPlaylistEndpoint":{"playlistId":"RDTMAK5uy_mix"}},
                  "thumbnailRenderer":${thumbs("https://lh3.googleusercontent.com/mix=s226")}}},
                {"musicTwoRowItemRenderer":{
                  "title":${runs(plain("Pal Pal"))},
                  "subtitle":${runs(plain("Song"), dot, link("Afusic", "UC9", "MUSIC_PAGE_TYPE_ARTIST"))},
                  "navigationEndpoint":{"watchEndpoint":{"videoId":"pp1","watchEndpointMusicSupportedConfigs":{"watchEndpointMusicConfig":{"musicVideoType":"MUSIC_VIDEO_TYPE_ATV"}}}}}}
              ]}}
          ],
          "continuations":[{"nextContinuationData":{"continuation":"HOME2"}}]
        }}}}]}}}""")
        val page = Parser.page(json)
        assertEquals("HOME2", page.continuation)
        assertEquals(listOf(Chip("Relax", "relaxP")), page.chips)
        assertEquals(2, page.sections.size)

        val quick = page.sections[0]
        assertEquals(Layout.GRID, quick.layout)
        val qp = quick.items[0] as Song
        assertEquals("Arijit Singh", qp.artistText)
        assertEquals("120M plays", qp.extra)

        val albums = page.sections[1]
        assertEquals(Layout.CAROUSEL, albums.layout)
        assertEquals(BrowseTarget("FEmusic_more", "m"), albums.more)
        val album = albums.items[0] as Album
        assertEquals("MPREb_3", album.browseId)
        assertEquals("OLAK5uy_x", album.playlistId)
        assertEquals("https://lh3.googleusercontent.com/alb=w544-h544", album.thumbnail)
        val mix = albums.items[1] as Playlist
        assertTrue(mix.playsDirectly)
        assertEquals("https://lh3.googleusercontent.com/mix=s544", mix.thumbnail)
        val song = albums.items[2] as Song
        assertEquals(listOf(Ref("Afusic", "UC9")), song.artists)
    }

    @Test
    fun albumPageHeaderAndTracks() {
        val json = JSONObject("""
        {"contents":{"twoColumnBrowseResultsRenderer":{
          "tabs":[{"tabRenderer":{"content":{"sectionListRenderer":{"contents":[
            {"musicResponsiveHeaderRenderer":{
              "title":${runs(plain("Animal"))},
              "subtitle":${runs(plain("Album"), dot, plain("2023"))},
              "straplineTextOne":${runs(link("Various Artists", "UCva", "MUSIC_PAGE_TYPE_ARTIST"))},
              "secondSubtitle":${runs(plain("23 songs"), dot, plain("1 hour, 20 minutes"))},
              "thumbnail":${thumbs("https://lh3.googleusercontent.com/cover=w544-h544", 544)}}}
          ]}}}}],
          "secondaryContents":{"sectionListRenderer":{"contents":[
            {"musicShelfRenderer":{"contents":[
              {"musicResponsiveListItemRenderer":{
                "playlistItemData":{"videoId":"t1"},
                "flexColumns":[{"musicResponsiveListItemFlexColumnRenderer":{"text":${runs(plain("Arjan Vailly"))}}}],
                "fixedColumns":[{"musicResponsiveListItemFixedColumnRenderer":{"text":${runs(plain("3:02"))}}}]}}
            ]}}
          ]}}
        }}}""")
        val page = Parser.page(json)
        val header = page.header!!
        assertEquals("Animal", header.title)
        assertEquals("Various Artists", header.strapline)
        assertEquals("23 songs • 1 hour, 20 minutes", header.secondSubtitle)
        assertEquals("https://lh3.googleusercontent.com/cover=w544-h544", header.thumbnail)
        val track = page.sections.single().items.single() as Song
        assertEquals("t1", track.videoId)
        assertEquals(182, track.durationSec)
        assertEquals("", track.thumbnail) // filled in from the album by YtMusic.browse
    }

    @Test
    fun watchQueuePrefersSongVersionsAndReadsLikes() {
        val panel = { id: String, title: String, type: String ->
            """{"playlistPanelVideoRenderer":{"videoId":"$id","title":${runs(plain(title))},
               "longBylineText":${runs(link("Arijit Singh", "UC2", "MUSIC_PAGE_TYPE_ARTIST"), dot, link("Aashiqui 2", "MPREb_9", "MUSIC_PAGE_TYPE_ALBUM"), dot, plain("2013"))},
               "lengthText":${runs(plain("4:22"))},
               "thumbnail":{"thumbnails":[{"url":"https://i.ytimg.com/vi/$id/hq.jpg","width":120}]},
               "navigationEndpoint":{"watchEndpoint":{"videoId":"$id","watchEndpointMusicSupportedConfigs":{"watchEndpointMusicConfig":{"musicVideoType":"$type"}}}}}}"""
        }
        val json = JSONObject("""
        {"playerOverlays":{"playerOverlayRenderer":{"actions":[{"likeButtonRenderer":{"target":{"videoId":"vid"},"likeStatus":"LIKE"}}]}},
         "contents":{"singleColumnMusicWatchNextResultsRenderer":{"tabbedRenderer":{"watchNextTabbedResultsRenderer":{"tabs":[{"tabRenderer":{"content":{"musicQueueRenderer":{"content":{
          "playlistPanelRenderer":{"playlistId":"RDAMVMvid","contents":[
            {"playlistPanelVideoWrapperRenderer":{
              "primaryRenderer":${panel("vid", "Tum Hi Ho (Official Video)", "MUSIC_VIDEO_TYPE_OMV")},
              "counterpart":[{"counterpartRenderer":${panel("atv", "Tum Hi Ho", "MUSIC_VIDEO_TYPE_ATV")}}]}},
            ${panel("next1", "Sunn Raha Hai", "MUSIC_VIDEO_TYPE_ATV")},
            {"playlistPanelVideoRenderer":{"videoId":"gone","unplayableText":${runs(plain("Unavailable"))}}}
          ],
          "continuations":[{"nextRadioContinuationData":{"continuation":"RADIO2"}}]}
        }}}}}]}}}}}""")
        val queue = Parser.queue(json, "vid")
        assertEquals("RDAMVMvid", queue.playlistId)
        assertEquals("RADIO2", queue.continuation)
        assertEquals(true, queue.liked)
        assertEquals(listOf("vid", "next1"), queue.songs.map { it.videoId })
        assertEquals("atv", queue.songs[0].playable.videoId)
        assertEquals("next1", queue.songs[1].playable.videoId)
        val first = queue.songs[0]
        assertEquals(Ref("Aashiqui 2", "MPREb_9"), first.album)
        assertEquals(262, first.durationSec)
    }

    @Test
    fun continuationsOldAndNewStyle() {
        val old = JSONObject("""
        {"continuationContents":{"musicPlaylistShelfContinuation":{
          "contents":[${songRow("p51", "Track 51", link("A", "UCa", "MUSIC_PAGE_TYPE_ARTIST"))}],
          "continuations":[{"nextContinuationData":{"continuation":"P3"}}]}}}""")
        val a = Parser.continued(old)
        assertEquals("P3", a.continuation)
        assertEquals("p51", (a.items.single() as Song).videoId)

        val fresh = JSONObject("""
        {"onResponseReceivedActions":[{"appendContinuationItemsAction":{"continuationItems":[
          ${songRow("p101", "Track 101", link("B", "UCb", "MUSIC_PAGE_TYPE_ARTIST"))},
          {"continuationItemRenderer":{"continuationEndpoint":{"continuationCommand":{"token":"P4"}}}}
        ]}}]}""")
        val b = Parser.continued(fresh)
        assertEquals("P4", b.continuation)
        assertEquals("p101", (b.items.single() as Song).videoId)

        val sections = JSONObject("""
        {"continuationContents":{"sectionListContinuation":{"contents":[
          {"musicCarouselShelfRenderer":{"header":{"musicCarouselShelfBasicHeaderRenderer":{"title":${runs(plain("More"))}}},
           "contents":[${songRow("m1", "M1", link("C", "UCc", "MUSIC_PAGE_TYPE_ARTIST"))}]}}],
          "continuations":[{"nextContinuationData":{"continuation":"HOME3"}}]}}}""")
        val c = Parser.continued(sections)
        assertEquals("HOME3", c.continuation)
        assertEquals("More", c.sections.single().title)
    }

    @Test
    fun artistsAlbumsAndPlaylistsInSearch() {
        val row = { title: String, id: String, type: String, sub: String ->
            """{"musicResponsiveListItemRenderer":{
                "navigationEndpoint":{"browseEndpoint":{"browseId":"$id","browseEndpointContextSupportedConfigs":{"browseEndpointContextMusicConfig":{"pageType":"$type"}}}},
                "thumbnail":${thumbs("https://lh3.googleusercontent.com/x=w60-h60")},
                "flexColumns":[{"musicResponsiveListItemFlexColumnRenderer":{"text":${runs(plain(title))}}},
                               {"musicResponsiveListItemFlexColumnRenderer":{"text":${runs(plain(sub))}}}]}}"""
        }
        val json = JSONObject("""{"contents":{"musicShelfRenderer":{"title":${runs(plain("Mixed"))},"contents":[
            ${row("Arijit Singh", "UC2", "MUSIC_PAGE_TYPE_ARTIST", "Artist")},
            ${row("Animal", "MPREb_3", "MUSIC_PAGE_TYPE_ALBUM", "Album")},
            ${row("Bollywood Butter", "VLPL1", "MUSIC_PAGE_TYPE_PLAYLIST", "Playlist")}
        ]}}}""")
        val items = Parser.sections(json).single().items
        assertTrue(items[0] is Artist)
        assertEquals("MPREb_3", (items[1] as Album).browseId)
        val playlist = items[2] as Playlist
        assertEquals("VLPL1", playlist.browseId)
        assertEquals("PL1", playlist.playlistId)
    }

    @Test
    fun songRunsWithoutLinks() {
        val credits = Parser.songRuns(
            listOf(JSONObject(plain("Song")), JSONObject(dot), JSONObject(plain("Some Artist")), JSONObject(dot),
                JSONObject(plain("Some Album")), JSONObject(dot), JSONObject(plain("3:05"))),
            skipType = true,
        )
        assertEquals(listOf(Ref("Some Artist")), credits.artists)
        assertEquals(Ref("Some Album"), credits.album)
        assertEquals(185, credits.duration)
        assertNull(Parser.parseDuration("Album"))
        assertEquals(3723, Parser.parseDuration("1:02:03"))
    }

    @Test
    fun suggestionsAndAccount() {
        val s = JSONObject("""{"contents":[{"searchSuggestionsSectionRenderer":{"contents":[
            {"searchSuggestionRenderer":{"suggestion":${runs(plain("arijit"), plain(" singh"))}}},
            {"searchSuggestionRenderer":{"suggestion":${runs(plain("arijit singh songs"))}}}]}}]}""")
        assertEquals(listOf("arijit singh", "arijit singh songs"), Parser.suggestions(s))

        val a = JSONObject("""{"actions":[{"openPopupAction":{"popup":{"multiPageMenuRenderer":{"header":{"activeAccountHeaderRenderer":{
            "accountName":${runs(plain("Chinmay"))},"channelHandle":${runs(plain("@chinmay"))},
            "accountPhoto":{"thumbnails":[{"url":"https://yt3.ggpht.com/p=s48","width":48}]}}}}}}}]}""")
        val info = Parser.accountInfo(a)
        assertNotNull(info)
        assertEquals("Chinmay", info!!.name)
        assertEquals("https://yt3.ggpht.com/p=s544", info.photo)
    }

    @Test
    fun sapisidHashMatchesTheKnownScheme() {
        assertEquals("abc", Auth.sapisid("PREF=x; SAPISID=abc; SID=y"))
        assertEquals("def", Auth.sapisid("__Secure-3PAPISID=def"))
        assertNull(Auth.sapisid("PREF=x"))
        // sha1("1700000000 abc https://music.youtube.com")
        val hash = Auth.sapisidHash("abc", "https://music.youtube.com", 1_700_000_000L)
        assertTrue(hash.startsWith("SAPISIDHASH 1700000000_"))
        assertEquals(40, hash.substringAfter('_').length)
    }
}
