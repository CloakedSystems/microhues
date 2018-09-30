var mh = {
  emitter: new window.DataTower,

  defaults: {
    song: 0,
  },

  beatAnalysisHandle: null,

  /* loaded packs */
  respacks: {},

  /* The currently active list of songs */
  songs: [],

  /* Index of the currently playing song */
  songIndex: null,
  /* The currently playing song */
  song: null,

  /* Handle for the beat analysis animation frame callback. */
  beatAnalysisHandle: null,

  /* Length of a beat in the current song */
  beatDuration: null,
  /* Information about the current beat */
  beat: { time: 0, buildup: null, loop: null, loopCount: 0 },
  /* The beat string, including the current beat */
  beatString: "",
  /* The number of beats in the loop */
  loopBeats: 0,
  /* The number of beats in the build */
  buildupBeats: 0,

  /* Saved promises that can be used to hook into various loading states. */
  setupPromise: null,

  element: [],

  /* Ready to roll? */
  ready: false,

  /* Is the player paused? */
  paused: false,

  /* Audio context */
  audioCtx: new AudioContext(),
  currentBuildupSource: null,
  currentBuildupBuffer: null,
  currentBuildupStartTime: null,
  currentLoopSource: null,
  currentLoopBuffer: null,
  currentLoopStartTime: null,
  gainNode: null,
  //filterNode: null,

  /* Volume */
  muted: false,
  savedGain: parseFloat(localStorage.getItem("Hues.gain")),

  randomSong: function() {
    var songs = this.songs
    var i
    if (this.songIndex === null) {
      i = Math.floor(Math.random() * songs.length)
    } else {
      i = Math.floor(Math.random() * (songs.length - 1))
      if (i >= this.songIndex) {
        i += 1
      }
    }
    this.changeSong(i)
  },

  getBeatString: function() {
    var length = arguments[0]
    if (typeof(length) === "undefined") {
      length = 256
    }
    var song = this.song
    var beatString = ""
    if (song) {
      beatString = this.beatString
      while (beatString.length < length) {
        beatString += song.rhythm
      }
    }

    return beatString
  },

  updateBeatString: function() {
    var song = this.song
    if (!song) {
      this.beatString = ""
      return
    }

    var beatString = ""
    var beat = this.beat

    if (beat.buildup !== null &&
        (typeof(song.buildupRhythm) !== "undefined") ) {
        /* Currently in buildup */
      beatString += song.buildupRhythm.slice(beat.buildup)
    } else if (beat.loop !== null) {
      beatString += song.rhythm.slice(beat.loop)
    }

    /* Add a copy of the loop rhythm to make sure fades calculate correctly */
    beatString += song.rhythm

    this.beatString = beatString
  },

  setupComplete: function() {
    return this.setupPromise
  },

  addSongs: function(respackName) {
    var songsList = arguments[1]

    var respack = this.respacks[respackName]
    if (typeof(respack) === "undefined") {
      throw Error("Unknown respack: " + respackName)
    }

    var songs = respack["songs"]
    if (typeof(songs) === "undefined") {
      throw Error("Respack does not contain songs: " + respackName)
    }

    var addSong = function(song) {
      /* Avoid duplicate songs; skip a song if it's already in the list */
      var i = this.songs.indexOf(song)
      if (i < 0) {
        this.songs.push(song)
      }
    }.bind(this)

    if (typeof(songsList) !== "undefined") {
      songsList.forEach(function(songIndex) {
        addSong(songs[songIndex])
      })
    } else {
      songs.forEach(addSong)
    }
  },

  play: function() {
    return window.MicroHues.playSong.bind(window.MicroHues)()
  },

  playSong: function() {
    return this.changeSong(this.songIndex)
  },

  prevSong: function() {
    var i = this.songIndex
    i -= 1
    if (i < 0) {
      i = this.songs.length - 1
    }
    return this.changeSong(i)
  },

  nextSong: function() {
    var i = this.songIndex
    i += 1
    if (i >= this.songs.length) {
      i = 0
    }
    return this.changeSong(i)
  },
  
  clampGain: function() {
    if (this.savedGain < -80) {
      this.savedGain = -80
    } else if (this.savedGain > 5) {
      this.savedGain = 5
    }
  },

  dbToVolume: function(db) {
    return Math.pow(10, db / 20)
  },

  respack: {},

  setElement: function(newElement, newTarget) {
    this.emitter.sendTo("changeElement", {elem: newElement, target: newTarget})
    this.element[newElement] = newTarget
  },

  isMuted: function() {
    return this.muted
  },

  getVolume: function() {
    return this.savedGain
  },

  mute: function() {
    if (!muted) {
      this.muted = true
      this.gainNode.gain.value = 0
      this.emitter.sendTo("volumechange", this.muted, this.savedGain)
    }
  },

  unmute: function() {
    if (muted) {
      this.muted = false
      this.gainNode.gain.value = this.dbToVolume(this.savedGain)
      this.emitter.sendTo("volumechange", this.muted, this.savedGain)
    }
  },
  
  pause: function() {
    if (!paused) {
      this.audioCtx.suspend()
      this.paused = true
    }
  },

  unpause: function() {
    if (paused) {
      this.audioCtx.resume()
      this.paused = false
    }
  },
  
  setVolume: function(db) {
    this.savedGain = db
    this.clampGain()
    if (!this.muted) {
      this.gainNode.gain.value = this.dbToVolume(this.savedGain)
    }
    this.emitter.sendTo("volumechange", this.muted, this.savedGain)
  },

  adjustVolume: function(db) {
    this.savedGain += db
    this.clampGain()
    if (!this.muted) {
      this.gainNode.gain.value = this.dbToVolume(this.savedGain)
    }
    this.emitter.sendTo("volumechange", this.muted, this.savedGain)
  },

  loadBegin: function(respack) {
    return new Promise(function(resolve, reject) {
      //I hate promises
      resolve(respack)
    }.bind(this))
  },

  loadRespackSongTrackFetch: function(uri) {
    return new Promise(function(resolve, reject) {
      fetch(uri)
      .then(function(response) {
        if (!response.ok) {
          reject(Error("Failed to fetch " + uri + ": " +
                response.status + " " + response.statusText))
          return
        }
        resolve(response.arrayBuffer())
      }.bind(this))
      .catch(reject)
    }.bind(this))
  },

  loadRespackSongTrackDecode: function(buffer) {
    return new Promise(function(resolve, reject) {
      this.audioCtx.decodeAudioData(buffer, function(audioBuffer) {
        resolve(audioBuffer)
      }, function(error) {
        reject(Error("Could not decode audio: " + error))
      })
    }.bind(this))
  },

  loadRespackSongTrack: function(uri) {
    return new Promise(function(resolve, reject) {
      this.loadRespackSongTrackFetch(uri + ".ogg")
      .then(this.loadRespackSongTrackDecode.bind(this))
      .then(resolve.bind(this))
      .catch(function(error) {
        this.emitter.sendTo("log", "ogg failed to load: ", error)
      }.bind(this))
    }.bind(this))
  },

  loadRespackSongLoop: function(respack, song) {
    return new Promise(function(resolve, reject) {
      var uri = respack["uri"] + "/Songs/" + encodeURIComponent(song["loop"])
      this.loadRespackSongTrack(uri)
      .catch(reject)
      .then(function(audioBuffer) {
        song["loopBuffer"] = audioBuffer
        resolve(song)
      }.bind(this))
    }.bind(this))
  },

  loadRespackSongBuildup: function(respack, song) {
    return new Promise(function(resolve, reject) {
      if (!song["buildup"]) {
        resolve(song)
        return
      }

      var uri = respack["uri"] + "/Songs/" + encodeURIComponent(song["buildup"])
      this.loadRespackSongTrack(uri)
      .catch(reject)
      .then(function(audioBuffer) {
        song["buildupBuffer"] = audioBuffer
        resolve(song)
      }.bind(this))
    }.bind(this))
  },

  loadRespackSongMedia: function(respack, song) {
    var loop = this.loadRespackSongLoop(respack, song)
    var buildup = this.loadRespackSongBuildup(respack, song)
    return Promise.all([loop, buildup]).then(function() {
      return Promise.resolve(song)
    }.bind(this))
  },

  loadRespackSongs: function(respack) {
    return new Promise(function(resolve, reject) {
      fetch(respack["uri"] + "/songs.xml")
      .catch(reject)
      .then(function(response) {
        
        if (response.status == 404) {
          resolve(respack)
          return
        }
        
        if (!response.ok) {
          reject(Error("Could not fetch respack songs.xml: " +
                response.status + " " + response.statusText))
          return
        }

        response.text()
        .catch(reject)
        .then(function(bodyText) {
          respack["songs"] = []
          var songPromises = []

          var parser = new DOMParser()
          var doc = parser.parseFromString(bodyText, "application/xml")
          var iterator = doc.evaluate("/songs/song", doc, null,
              XPathResult.ORDERED_NODE_ITERATOR_TYPE, null)
          var node = iterator.iterateNext()
          while (node) {
            var song = {}
            song["loop"] = node.getAttribute("name")

            var songIterator = doc.evaluate("*", node, null,
                XPathResult.UNORDERED_NODE_ITERATOR_TYPE, null)
            var songNode = songIterator.iterateNext()
            while (songNode) {
              song[songNode.localName] = songNode.textContent
              songNode = songIterator.iterateNext()
            }

            respack["songs"].push(song)
            this.emitter.sendTo("progress", 0, 1)
            songPromises.push(this.loadRespackSongMedia(respack, song)
              .then(function() {
                this.emitter.sendTo("progress", 1, 0)
              }.bind(this))
            )

            node = iterator.iterateNext()
          }

          Promise.all(songPromises).then(function() {
            resolve(respack)
          }.bind(this)).catch(reject)
        }.bind(this))
      }.bind(this))
    }.bind(this))
  },

  loadRespack: function(uri) {
    return new Promise(function(resolve, reject) {
      // Strip a trailing /, since we're going to be generating uris with this
      // as the base.
      var rname = uri
      var respack = {
        "uri": uri,
        "name": rname
      }

      this.emitter.sendTo("log", "Loading respack at " + uri)
      this.emitter.sendTo("progress", 0, 4)

      var respackLoad = this.loadBegin(respack)
      
      respackLoad.then(function(respack) {
        this.emitter.sendTo("log", "Loaded respack info for " + respack["name"])
        this.emitter.sendTo("progress", 1, 0)
      }.bind(this))

      var respackSongs = respackLoad.then(this.loadRespackSongs.bind(this))
      respackSongs.then(function(respack) {
        if (respack["songs"]) {
          this.emitter.sendTo("log", "Loaded " + respack["songs"].length +
              " songs from " + respack["name"])
        }
        this.emitter.sendTo("progress", 1, 0)
      }.bind(this))

      Promise.all([respackSongs])
      .catch(reject)
      .then(function() {
        this.emitter.sendTo("log", "All content from respack " + respack["name"] +
            " has loaded")
        this.respacks[respack["name"]] = respack
        respack["songs"].forEach((s) => {
          this.songs.push(s)
        })
        resolve(respack)
      }.bind(this))

    }.bind(this))
  },

  initializePromise: null,

  initialize: function(options) {
    if (!this.initializePromise) {
      this.initializePromise = new Promise(function(resolve, reject) {
        //var this = that
        this.emitter.sendTo("progressstart")

        var optRespack = this.config.respack

        var respacks = []
        if (typeof(optRespack) !== 'undefined') respacks = respacks.concat(optRespack)
        var respackPromises = []

        for (var i = 0; i < respacks.length; i++) {
          this.emitter.sendTo("log", "Loading respack " + respacks[i])
          respackPromises.push(this.loadRespack(respacks[i]))
        }

        var setupPromise = Promise.all(respackPromises)
        .then(function(respacks) {
          var builtin = respacks.shift()

          for (var i = 0; i < respacks.length; i++) {
            var respack = respacks[i]
            if (respack.songs) {
              this.addSongs(respack.name)
            }
          }

          this.emitter.sendTo("log", "Loaded songs:")
          this.emitter.sendTo("log", this.songs)
          /* Preset the selected song */
          var song = options.song
          if (typeof(song) === 'undefined') {
            song = 0
          }
          this.songIndex = song
          this.song = this.songs[song]

          this.emitter.sendTo("microhues progressend")
        }.bind(this))

        resolve(setupPromise)
      }.bind(this))
    }
    return this.initializePromise
  },

  stopSong: function() {
    this.emitter.sendTo("log", "Stopping playback")
    this.playing = false
    this.emitter.sendTo("isPlaying", false)

    if (this.currentLoopSource) {
      this.currentLoopSource.stop()
      this.currentLoopSource.disconnect()
      this.currentLoopSource = null
    }
    if (this.currentLoopBuffer) {
      this.currentLoopBuffer = null
    }
    if (this.currentBuildupSource) {
      this.currentBuildupSource.stop()
      this.currentBuildupSource.disconnect()
      this.currentBuildupSource = null
    }
    if (this.currentBuildupBuffer) {
      this.currentBuildupBuffer = null
    }

    this.stopBeatAnalysis()
  },

  changeSong: function(songIndex) {
    this.stopSong()

    this.playing = true
    this.emitter.sendTo("isPlaying", true)

    this.emitter.sendTo("log", "New song index is " + songIndex)
    var song = this.songs[songIndex]

    this.emitter.sendTo("log", MicroHues)
    this.emitter.sendTo("log", song)
    this.songIndex = songIndex
    this.song = song

    this.emitter.sendTo("log", "Switching to " + this.song.title)

    var buildupBuffer = song["buildupBuffer"]
    var buildupDuration = 0
    var buildupSource = null
    if (buildupBuffer && buildupBuffer.length > 0) {
      buildupDuration = buildupBuffer.duration
      buildupSource = this.audioCtx.createBufferSource()
      buildupSource.buffer = buildupBuffer
      //buildupSource.connect(this.filterNode)
      buildupSource.connect(this.gainNode)
    }

    var loopBuffer = song["loopBuffer"]
    var loopDuration = loopBuffer.duration
    var loopSource = this.audioCtx.createBufferSource()
    loopSource.buffer = loopBuffer
    loopSource.loop = true
    //loopSource.connect(this.filterNode)
    loopSource.connect(this.gainNode)

    var loopBeats = song["rhythm"].length
    this.loopBeats = loopBeats
    var beatDuration = loopDuration / loopBeats
    this.beatDuration = beatDuration
    var buildupBeats = Math.round(buildupDuration / beatDuration)
    this.buildupBeats = buildupBeats

    this.emitter.sendTo("log", "Loop duration is " + loopDuration + " (" +
      song["rhythm"].length + " beats)")
    this.emitter.sendTo("log", "Beat duration is " + beatDuration)
    this.emitter.sendTo("log", "Buildup duration is " + buildupDuration + " (" +
      buildupBeats + " beats)")

    if (buildupBuffer) {
      /* Songs that have buildups might be missing buildupRhythm, or
       * have it too short. Fix that by padding it. */
      if (typeof(song["buildupRhythm"]) !== "undefined") {
        var buildupDelta = Math.round(buildupDuration / beatDuration) - 
          song["buildupRhythm"].length
        if (buildupDelta > 0) {
          song["buildupRhythm"] += ".".repeat(buildupDelta)
        }
      } else {
        song["buildupRhythm"] = ".".repeat(
            Math.round(buildupDuration / beatDuration))
      }
    }

    if (buildupSource) {
      this.currentBuildupSource = buildupSource
      this.currentBuildupBuffer = buildupBuffer
    }
    this.currentLoopSource = loopSource
    this.currentLoopBuffer = loopBuffer

    var loopStart
    var buildupStart

    var startPlayback = function() {
      buildupStart = this.audioCtx.currentTime
      loopStart = buildupStart + buildupDuration
      if (buildupSource) {
        buildupSource.start(buildupStart)
      }
      loopSource.start(loopStart)

      this.currentBuildupStartTime = buildupStart
      this.currentLoopStartTime = loopStart

      this.updateBeatString()
      this.startBeatAnalysis()

      this.emitter.sendTo("songchange",
          song, loopStart, buildupStart, beatDuration)
      this.inverted = false
      this.emitter.sendTo("inverteffect",
          this.audioCtx.currenTime, this.inverted)
    }.bind(this)

    var suspend = Promise.resolve()
    if (this.audioCtx.suspend && this.audioCtx.resume) {
      suspend = this.audioCtx.suspend()
    }

    var playback = suspend.then(startPlayback.bind(this))

    var resume
    if (this.audioCtx.suspend && this.audioCtx.resume) {
      resume = playback.then(function() {return this.audioCtx.resume()}.bind(this))
    } else {
      resume = playback
    }

    return resume.then(function() {
      return song
    }.bind(this))
  },

  getCurrentSong: function() {
    return this.song
  },

  doBeatEffect: function() {
    var beatString = this.beatString
    if (beatString == "") {
      return
    }

    var beat = this.beat
    var current = beatString[0]
    var rest = beatString.slice(1)

    this.emitter.sendTo("beat", current, beatString, beat.time)
  },

  beatAnalyze: function() {
    if (!this.currentLoopBuffer) {
      this.stopBeatAnalysis()
      return
    }

    var time = this.audioCtx.currentTime
    var song = this.song
    var beat = this.beat
    var beatDuration = this.beatDuration

    var loopCount = 0
    if (time >= this.currentLoopStartTime) {
      loopCount = Math.floor((time - this.currentLoopStartTime)/this.currentLoopBuffer.duration)
    }

    if (beat.buildup === null && beat.loop === null) {
      // We haven't played the first beat of the song yet, so initialize
      // for looping...
      if (typeof(song.buildupRhythm) !== "undefined") {
        beat.buildup = -1
      } else {
        beat.loop = -1
      }
      beat.time = 0
      beat.loopCount = 0

      this.emitter.sendTo("log", "build start", this.currentBuildupStartTime, "loop start", this.currentLoopStartTime)
    }

    var doBeatActions = function() {
      this.beat = beat
      this.updateBeatString()

      this.doBeatEffect()
    }.bind(this)

    if (beat.buildup !== null) {
      var nextBeat = { buildup: beat.buildup + 1, loop: null, loopCount: 0 }
      nextBeat.time = this.currentLoopStartTime -
        (this.buildupBeats - nextBeat.buildup) * beatDuration

      while (nextBeat.time < time && nextBeat.buildup < this.buildupBeats) {
        beat = nextBeat

        doBeatActions()

        nextBeat = {
          buildup: beat.buildup + 1,
          loop: null,
          loopCount: beat.loopCount
        }
        nextBeat.time = this.currentLoopStartTime -
          (this.buildupBeats - nextBeat.buildup) * beatDuration
      }
    }

    if (beat.buildup == this.buildupBeats - 1) {
      // Transition from buildup to loop
      beat.buildup = null
      beat.loop = -1
    }

    if (beat.loop !== null) {
      var nextBeat = {
        buildup: null,
        loop: beat.loop + 1,
        loopCount: beat.loopCount
      }
      nextBeat.time = this.currentLoopStartTime +
        nextBeat.loopCount * this.currentLoopBuffer.duration +
        nextBeat.loop * beatDuration

      while (nextBeat.time < time) {
        beat = nextBeat

        doBeatActions()

        if (beat.loop == this.loopBeats - 1) {
          beat.loop = -1
          beat.loopCount = beat.loopCount + 1
          this.emitter.sendTo("log", "loop count now", beat.loopCount)
        }

        nextBeat = {
          buildup: null,
          loop: beat.loop + 1,
          loopCount: beat.loopCount
        }
        nextBeat.time = this.currentLoopStartTime +
          nextBeat.loopCount * this.currentLoopBuffer.duration +
          nextBeat.loop * beatDuration
      }
    }

    this.emitter.sendTo("frame", time)
    this.beatAnalysisHandle = window.requestAnimationFrame(this.beatAnalyze.bind(this))
  },

  startBeatAnalysis: function() {
    if (this.beatAnalysisHandle === null) {
      this.emitter.sendTo("log", "Starting beat analysis")
      this.beatAnalysisHandle = window.requestAnimationFrame(this.beatAnalyze.bind(this))
    }
  },

  stopBeatAnalysis: function() {
    this.emitter.sendTo("log", "Stopping beat analysis")
    var handle = this.beatAnalysisHandle
    if (handle !== null) {
      window.cancelAnimationFrame(this.beatAnalysisHandle)
      this.beatAnalysisHandle = null
    }
    var beat = { "buildup": null, "loop": null }
    this.beat = beat
    this.emitter.sendTo("beat", beat)
  },

  setup: async function() {
    var e = this.config.defaultEmitter
    if (typeof(e) !== 'undefined'){
      this.emitter = e
    }

    this.emitter.sendTo("log", "setup()")

    var song = this.config.defaultSong
    if (typeof(song) !== 'undefined') {
      this.defaults.song = song
    }
    
    this.gainNode = this.audioCtx.createGain()
    this.gainNode.connect(this.audioCtx.destination)

    if (localStorage.getItem('Hues.muted') === "true") {
      this.muted = true
    }
    if (this.savedGain === null || isNaN(this.savedGain)) {
      this.savedGain = -10.0
    }

    this.clampGain()
    if (this.muted) {
      this.gainNode.gain.value = 0
    } else {
      this.gainNode.gain.value = this.dbToVolume(this.savedGain)
    }

    this.emitter.bind('volumechange', function(muted, gain) {
      localStorage.setItem('Hues.muted', muted)
      localStorage.setItem('Hues.gain', gain)
    })

    this.emitter.bind("progressend", function(){
      this.ready = true
    })

    this.emitter.sendTo("finished loading", true)
  },

  config: { // defaults
    "defaultEmitter": undefined,
    "defaultSong": 0,
    "respack": undefined
  }
}

window.MicroHues = mh

//mh.emitter.debug(console.log)

mh.emitter.bind("log", function(){
  var args = Array.prototype.slice.call(arguments)
  args.unshift("[µhues]")
  console.log.apply(console, args)
})

mh.setup()

window.MicroHues.initialize({})
