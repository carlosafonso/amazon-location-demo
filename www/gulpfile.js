var gulp = require('gulp'),
    replace = require('gulp-replace'),
    del = require('del'),
    fs = require('fs');

function clean() {
    return del(['./dist']);
}

function build(cb) {
    var settings = JSON.parse(fs.readFileSync('config.json', 'utf8'));

    gulp.src(['./index.html'])
        .pipe(replace('@@apiEndpoint', settings.apiEndpoint))
        .pipe(replace('@@cognitoIdentityPoolId', settings.cognitoIdentityPoolId))
        .pipe(replace('@@mapName', settings.mapName))
        .pipe(gulp.dest('./dist'));

    gulp.src(['./app.js', './aws-sdk-2.817.0.min.js'])
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
