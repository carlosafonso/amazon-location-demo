var gulp = require('gulp'),
    replace = require('gulp-replace'),
    useref = require('gulp-useref'),
    del = require('del'),
    fs = require('fs');

function clean() {
    return del(['./dist']);
}

function build(cb) {
    var settings = JSON.parse(fs.readFileSync('config.json', 'utf8'));

    gulp.src(['./index.html'])
        .pipe(replace('@@apiEndpoint', settings.apiEndpoint))
        .pipe(replace('@@apiKey', settings.apiKey))
        .pipe(replace('@@cognitoIdentityPoolId', settings.cognitoIdentityPoolId))
        .pipe(replace('@@mapName', settings.mapName))
        .pipe(useref())
        .pipe(gulp.dest('./dist'));

    cb();
}

function watch(cb) {
    var files = [
        './index.html',
        './app.js',
        './config.json'
    ];
    gulp.watch(files, gulp.series(clean, build));
}

exports.watch = watch;

exports.default = gulp.series(clean, build);
