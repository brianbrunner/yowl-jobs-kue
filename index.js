var kue = require('kue');
var Route = require('yowl').Route;

var proto = module.exports = function(options) {

  options = options || {};

  var jobQueue = function(bot) {
    jobQueue.init(bot);
  }

  jobQueue.__proto__ = proto
  jobQueue.options = options;
  jobQueue.queue = kue.createQueue(options.kue);
  jobQueue.processors = {};

  return jobQueue

}

proto.process = function process(eventName, processor) {
  if (this.bot) {
    this.queue.process(eventName, (job, jobContext, done) => {
      var platform = this.platforms[job.data.platformId];
      var context = {
        platform: platform,
        sessionId: job.data.sessionId
      }
      var event = {
        platform: platform,
        type: eventName,
        job: job,
        jobContext: jobContext
      }
      this.bot.prepare(context, event, function() {
        event.job.data = event.job.data.jobData;
        processor(context, event, done);
      })
    });
  } else {
    this.processors[eventName] = processor;
  }
}

proto.init = function init(bot) {

  // Grab a reference to our bot
  this.bot = bot

  // Associate our platforms
  this.platforms = {};
  this.bot.extensions.filter(function(extension) {
      return extension.id && extension.capabilities && extension.send;
  }).forEach((extension) => {
    this.platforms[extension.id] = extension;
  })

  // Associate our session managers
  if (this.options.session_managers) {
    this.session_managers = options.session_managers;
  } else if (this.options.session_manager) {
    this.session_managers = [options.session_manager];
  }

  // Sort of hacky, but we need this to be called after the context/event
  // are prepared but before any other middleware is run
  var route = new Route(true, {}, this.attachCreator.bind(this));
  bot.router().stack.splice(1, 0, route);

  // Add any processors that we're given to us before we were initialized
  for (var key in this.processors) {
    this.process(key, this.processors[key]);
  }
  delete this.processors;
}

proto.attachCreator = function attachCreator(context, event) {
  context.createJob = (jobName, jobData) => {
    var data = {
      platformId: context.platform.id,
      sessionId: context.sessionId,
      jobData: jobData
    };
    return this.queue.create(jobName, data);
  }
}
