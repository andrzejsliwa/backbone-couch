#!/usr/bin/env watchr

require 'rubygems'
require 'json'

begin
  require 'ruby-growl'
  is_growl = true
rescue LoadError
  puts "growl skiped ..."
end

Signal.trap('INT') { abort("\nTerminated Successfuly.") } # Ctrl-C

def check_file(filename)
  filepath = File.join(Dir.pwd, filename)

  unless File.exist?(filepath)
    puts "missing #{filename}"
    exit
  end
  filepath
end


def push(appname, growl)
  if growl
    growl.notify("CouchApp AutoPush", "backbone-couch '#{appname}' Pushed", "test", 1, true)
  end

  run "soca push test"
end

def run(cmd)
  puts   cmd
  system cmd
end

# couchapprc = check_file(".couchapprc")
# couchapprc = JSON.parse(File.read(couchapprc))
# dbname = couchapprc["env"]["test"]["db"].match(/\d\/(\S*)$/m)[1]

configjs = check_file("config.js")
configjs = JSON.parse(File.read(configjs))
appname = configjs["id"]

if is_growl
  growl = Growl.new("localhost", "ruby-growl", ["CouchApp AutoPush"])
  growl.notify("CouchApp AutoPush", "backbone-couch", "default & test.", 1, true)
end

push(appname, growl)

watch('.*') do |m|
  unless m[0].match(/\/.idea\//) or m[0].match(/\/.git\//)
    puts "#{m[0]} was changed."
    push(appname, growl)
  end
end




