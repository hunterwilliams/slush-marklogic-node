(function () {
  'use strict';

  angular.module('ml.login')
    .factory('loginService', LoginService);

  LoginService.$inject = ['$http', '$rootScope'];
  function LoginService($http, $rootScope) {

    function login(username, password) {
      return $http.get('/api/user/login', {
        params: {
          'username': username,
          'password': password
        }
      });
    }

    function logout() {
      return $http.get('/api/user/logout');
    }

    return {
      login: login,
      logout: logout
    };
  }
}());
