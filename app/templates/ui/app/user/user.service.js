(function () {
  'use strict';

  angular.module('sample.user')
    .factory('userService', UserService);

  UserService.$inject = ['$http', '$rootScope','loginService'];
  function UserService($http, $rootScope, loginService) {
    var _currentUser = null;

    function currentUser() {
      return _currentUser;
    }

    function getUser() {
      if (_currentUser) {
        return _currentUser;
      }

      return $http.get('/api/user/status', {}).then(updateUser);
    }

    function updateUser(response) {
      var data = response.data;

      if (data.authenticated === false) {
        return null;
      }

      _currentUser = {
        name: data.username,
      };

      if ( data.profile ) {
        _currentUser.hasProfile = true;
        _currentUser.fullname = data.profile.fullname;

        if ( _.isArray(data.profile.emails) ) {
          _currentUser.emails = data.profile.emails;
        }
        else {
          // wrap single value in array, needed for repeater
          _currentUser.emails = [data.profile.emails];
        }
      }

      $rootScope.$broadcast('auth:login-success', _currentUser);
      return _currentUser;
    }

    function login(username, password) {
      return loginService.login(username, password).then(updateUser);
    }

    function logout() {
      return loginService.logout().then(function(response) {
        _currentUser = null;
        return _currentUser;
      });
    }

    return {
      currentUser: currentUser,
      login: login,
      logout: logout,
      getUser: getUser
    };
  }
}());
