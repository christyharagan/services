'use strict';

var _ = require('underscore');
var EventEmitter = require('events').EventEmitter;
var Promise = require('rsvp').Promise;

var chainInterceptors = function (interceptors, value, resolve, reject) {
  var i = 0;
  var intercept = function (value) {
    if (i === interceptors.length) {
      resolve(value);
    } else {
      var transformedValue;
      try {
        transformedValue = interceptors[i++](value);
      } catch (e) {
        reject(e);
      }
      if (transformedValue.then) {
        transformedValue.then(intercept, reject);
      } else {
        intercept(transformedValue);
      }
    }
  };
  intercept(value);
};

module.exports = function (serviceSpec, serviceImpl, interceptor) {
  var wrapper = new EventEmitter();

  var events = serviceSpec.events;
  var methods = serviceSpec.methods;

  _.each(events, function (eventSpec, eventName) {
    serviceImpl.on(eventName, function (value) {
      var interceptorsForEvent = interceptor('event', eventName, value);
      if (interceptorsForEvent && interceptorsForEvent.length > 0) {
        chainInterceptors(interceptorsForEvent, value, function (value) {
          wrapper.emit(eventName, value);
        }, function (error) {
          if (serviceSpec.errorEvent) {
            wrapper.emit(serviceSpec.errorEvent, error);
          } else if (eventSpec.errorEvent) {
            wrapper.emit(eventSpec.errorEvent, error);
          }
        });
      } else {
        wrapper.emit(eventName, value);
      }
    });
  });

  _.each(methods, function (methodSpec, methodName) {
    wrapper[methodName] = function (args) {
      return new Promise(function (resolve, reject) {
        var interceptMethodReturn = function (value) {
          var interceptorsForMethodReturn = interceptor('methodReturn', methodName, args, value);
          if (interceptorsForMethodReturn && interceptorsForMethodReturn.length > 0) {
            chainInterceptors(interceptorsForMethodReturn, value, resolve, reject);
          } else {
            resolve(value);
          }
        };

        var interceptorsForMethodCall = interceptor('methodCall', methodName, args);
        if (interceptorsForMethodCall && interceptorsForMethodCall.length > 0) {
          chainInterceptors(interceptorsForMethodCall, args, function (args) {
            serviceImpl[methodName](args).then(interceptMethodReturn, reject);
          }, reject);
        } else {
          serviceImpl[methodName](args).then(interceptMethodReturn, reject);
        }
      });
    };
  });


  return wrapper;
};