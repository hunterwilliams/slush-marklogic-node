/* jshint node: true */

'use strict';

var gulp = require('gulp'),
  colors = require('colors'),
  FetchStream = require('fetch').FetchStream,
  fs = require('fs'),
  inquirer = require('inquirer'),
  install = require('gulp-install'),
  q = require('q'),
  rename = require('gulp-rename'),
  pkgSettings = require('./package.json'),
  spawn = require('child_process').spawn,
  win32 = process.platform === 'win32',
  _ = require('underscore.string')
  ;

var npmVersion = null;

var settings = {
  includeEsri: false
};

function printVersionWarning() {
  if (npmVersion && npmVersion !== pkgSettings.version.trim()) {
    process.stdout.write('\n------------------------------------\n'.red);
    process.stdout.write('Slush MarkLogic Node is out of date:\n'.bold.yellow);
    process.stdout.write( (' * Locally installed version: ' + pkgSettings.version + '\n').yellow );
    process.stdout.write( (' * Latest version: ' + npmVersion + '\n').yellow );
    process.stdout.write( ' * Run '.yellow + 'npm install -g slush-marklogic-node'.bold + ' to update\n'.yellow );
    process.stdout.write('------------------------------------\n\n'.red);
    npmVersion = null;
  }
}

function checkLatestVersion() {
  var latestVersion = q.defer();

  try {
    console.log('checking for latest version');
    var proxy = process.env.PROXY || process.env.http_proxy || null;
    var request = require('request');
    request({ url: 'http://registry.npmjs.org/slush-marklogic-node/latest', proxy: proxy }, function(err, res, body) {
      try {
        npmVersion = JSON.parse(body).version;
      }
      catch(e) {}
      latestVersion.resolve();
    });
  }
  catch (e) {
    latestVersion.resolve();
  }

  return latestVersion.promise;
}

function getNameProposal () {
  var path = require('path');
  try {
    return require(path.join(process.cwd(), 'package.json')).name;
  } catch (e) {
    return path.basename(process.cwd());
  }
}

// Download the Roxy ml script from GitHub
function getRoxyScript(appName, mlVersion, appType, branch) {

  var d = q.defer(),
    out;

  var scriptName = (win32 ? '' : './') + 'ml' + (win32 ? '.bat' : '');

  console.log('Retrieving Roxy script');
  out = fs.createWriteStream(scriptName);
  var stream = new FetchStream('https://github.com/marklogic/roxy/raw/' + branch + '/' + scriptName);
  stream.pipe(out);
  stream.on('end', function() {
    console.log('Got Roxy script');
    out.end();

    fs.chmod(scriptName, '755', function (err) {
      if (err) {
        console.log(err);
        d.reject(err);
      }
      else {
        console.log ('chmod done; appName=' + appName + '; mlVersion=' + mlVersion + '; appType=' + appType + '; branch=' + branch);
        d.resolve({
          'script': scriptName,
          'app': appName,
          'mlVersion': mlVersion,
          'appType': appType,
          'branch': branch
        });
      }
    });
  });

  return d.promise;
}

// Run the Roxy "ml new" command for the new project
function runRoxy(config) {
  var scriptName = config.script,
    appName = config.app,
    mlVersion = config.mlVersion,
    appType = config.appType,
    branch = config.branch;

  var d = q.defer();

  var args = [
    'new',
    appName,
    '--server-version=' + mlVersion,
    '--app-type=' + appType,
    '--branch=' + branch
  ];

  console.log('Spawning Roxy new command: ' + scriptName + ' ' + args.join(' '));
  var child = spawn(scriptName, args);

  child.on('close', function() {
    console.log('done running ml new');
    d.resolve('done');
  });

  child.stdout.on('data', function (data) {
    console.log('' + data);
  });

  child.stderr.on('data', function (data) {
    console.log('' + data);
  });

  return d.promise;
}

// Make some changes to Roxy's deploy/build.properties file for the out-of-the-box application
function configRoxy(appPort,xccPort) {
  console.log('Configuring Roxy');

  try {

    var properties = fs.readFileSync('deploy/build.properties', { encoding: 'utf8' });

    // set the authentication-method property to digestbasic
    properties = properties.replace(/^authentication\-method=digest/m, 'authentication-method=digestbasic');

    //set the ports
    properties = properties.replace(/^app\-port=8040/m, 'app-port=' + appPort);
    properties = properties.replace(/^xcc\-port=8041/m, 'xcc-port=' + xccPort);

    fs.writeFileSync('deploy/build.properties', properties);
  } catch (e) {
    console.log('failed to update properties: ' + e.message);
  }

  try {
    var foo = fs.readFileSync('deploy/ml-config.xml', { encoding: 'utf8' });

    // add an index for the default content
    foo = foo.replace(/^\s*<range-element-indexes>/m,
      '      <range-element-indexes>\n' +
      '        <range-element-index>\n' +
      '          <scalar-type>string</scalar-type>\n' +
      '          <namespace-uri/>\n' +
      '          <localname>eyeColor</localname>\n' +
      '          <collation>http://marklogic.com/collation/codepoint</collation>\n' +
      '          <range-value-positions>false</range-value-positions>\n' +
      '        </range-element-index>\n');

    fs.writeFileSync('deploy/ml-config.xml', foo);
  } catch (e) {
    console.log('failed to update configuration: ' + e.message);
  }

}

gulp.task('default', ['init', 'configGulp', 'configEsri'], function(done) {
  gulp.src(['./bower.json', './package.json'])
   .pipe(install());
});

gulp.task('configEsri', ['init'], function(done) {
  if (!settings.includeEsri) {
    var indexData, appData;

    try {
      // Update the index.html file.
      indexData = fs.readFileSync('ui/index.html', { encoding: 'utf8' });
      indexData = indexData.replace(/^.*arcgis.*$[\r\n]/gm, '');
      indexData = indexData.replace(/^.*esri.*$[\r\n]/gm, '');
      fs.writeFileSync('ui/index.html', indexData);
    } catch (e) {
      console.log('failed to update index.html: ' + e.message);
    }

    try {
      // Update the app.js file.
      appData = fs.readFileSync('ui/app/app.js', { encoding: 'utf8' });
      appData = appData.replace(/^.*esriMap.*$[\r\n]/gm, '');
      fs.writeFileSync('ui/app/app.js', appData);
    } catch (e) {
      console.log('failed to update app.js: ' + e.message);
    }
  }

  done();
});

gulp.task('configGulp', ['init'], function(done) {

  try {

    var config = fs.readFileSync('gulp.config.js', { encoding: 'utf8' });

    //set the ports
    config = config.replace(/\bdefaultPort: '9070'/m, "defaultPort: '" + settings.nodePort + "'");
    config = config.replace(/\bport: '8040'/m, "port: '" + settings.appPort + "'");

    fs.writeFileSync('gulp.config.js', config);
  } catch (e) {
    console.log('failed to update gulp.config.js: ' + e.message);
  }

  done();
});

gulp.task('checkForUpdates', function(done) {
  checkLatestVersion().then(function() {
    printVersionWarning();
    done();
  });
});

gulp.task('init', ['checkForUpdates'], function (done) {
  inquirer.prompt([
    {type: 'input', name: 'name', message: 'Name for the app?', default: getNameProposal()},
    {type: 'input', name: 'nodePort', message: 'Node app port?', default: 9070},
    {type: 'input', name: 'appPort', message: 'MarkLogic App/Rest port?', default: 8040},
    {type: 'input', name: 'xccPort', message: 'XCC port?', default:8041},
    {type: 'list', name: 'mlVersion', message: 'MarkLogic version?', choices: ['8','7', '6', '5'], default: 0},
    {type: 'list', name: 'appType', message: 'Roxy App Type?', choices: ['rest', 'mvc', 'hybrid'], default: 0},
    {type: 'list', name: 'branch', message: 'Roxy Branch?', choices: ['master', 'dev'], default: 0},
    {type: 'confirm', name: 'includeEsri', message: 'Include ESRI Maps?', default: false}
  ],
  function (answers) {
    answers.nameDashed = _.slugify(answers.name);
    answers.modulename = _.camelize(answers.nameDashed);
    settings.nodePort = answers.nodePort;
    settings.appPort = answers.appPort;
    settings.includeEsri = answers.includeEsri;

    getRoxyScript(answers.nameDashed, answers.mlVersion, answers.appType, answers.branch)
      .then(runRoxy)
      .then(function() {
        // Copy over the Angular files
        var files = [__dirname + '/app/templates/**'];

        // Adjust files to copy based on whether ESRI Maps are included
        if (!answers.includeEsri) {
          files.push('!' + __dirname + '/app/templates/ui/app/esri-map/**');
          files.push('!' + __dirname + '/app/templates/ui/app/esri-map');
          files.push('!' + __dirname + '/app/templates/ui/app/detail/detail.html');
        }
        else {
          files.push('!' + __dirname + '/app/templates/ui/app/detail/detail-no-esri.html');
        }

        process.chdir('./' + answers.nameDashed);

        configRoxy(answers.appPort, answers.xccPort);

        gulp.src(files)
          .pipe(rename(function (file) {
            // change _foo to .foo
            if (file.basename[0] === '_') {
              file.basename = '.' + file.basename.slice(1);
            }

            // Rename detail file when not using ESRI.
            else if (!answers.includeEsri && file.basename === 'detail-no-esri' && file.extname === '.html') {
              console.log('changed name to detail.html');
              file.basename = 'detail';
            }

          }))
          .pipe(gulp.dest('./')) // Relative to cwd
          .on('end', function () {
            done(); // Finished!
          });
      },
      function(reason) {
        console.log('Caught an error: ' + reason);
      });

  });


});
