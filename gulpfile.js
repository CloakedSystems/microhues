'use strict'

var babelify = require('babelify')
var browserify = require('browserify')
var gulp = require('gulp')
var rename = require('gulp-rename')
var source = require('vinyl-source-stream')
var buffer = require('vinyl-buffer')
var gutil = require('gulp-util')
var glob = require('glob')
var es = require('event-stream')

gulp.task('js', function (done) {
  glob('./src/**.js', function(err, files) {
      if(err) done(err);

      var tasks = files.map(function(entry) {
          return browserify({ entries: [entry], transform: [babelify] })
              .bundle()
              .pipe(source(entry))
              .pipe(rename({
                  extname: '.js'
              }))
              .pipe(gulp.dest('./dist'));
          });
      es.merge(tasks).on('end', done);
  })
})