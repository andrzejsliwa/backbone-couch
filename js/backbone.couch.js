/**
 *   ______              _     _                          ______                   _
 *  (____  \            | |   | |                        / _____)                 | |
 *   ____)  ) ____  ____| |  _| | _   ___  ____   ____  | /       ___  _   _  ____| | _
 *  |  __  ( / _  |/ ___) | / ) || \ / _ \|  _ \ / _  ) | |      / _ \| | | |/ ___) || \
 *  | |__)  | ( | ( (___| |< (| |_) ) |_| | | | ( (/ / _| \_____| |_| | |_| ( (___| | | |
 *  |______/ \_||_|\____)_| \_)____/ \___/|_| |_|\____|_)\______)\___/ \____|\____)_| |_|
 *
 * Backbone.couch.js v.0.0.1 - (c) 2011 Andrzej Sliwa
 *
 * May be freely distributed under the MIT license.
 *
 * Based on Jan Monschke backbone.couchdb.js connector with some improvements,
 * reimplemented for learning purposes and for fixing existing problems with
 * original connector, added new features required by personal use cases
 *
 * Example configuration:
 *
 *   Backbone.couch.databaseName = "backbone-couch-test";
 *   Backbone.couch.ddocName = "backbone-couch";
 *   Backbone.couch.ddocChange(function(ddocName){
 *     if (console && console.log) {
 *       console.log("current ddoc: '" + ddocName + "' changed");
 *       console.log("restarting...");
 *     }
 *     window.location.reload();
 *   });
 *
 *
 */
(function(){

  if (typeof Backbone === 'undefined') {
    new Error("Missing / not loaded backbone.js !!");
  }

  if (typeof $.couch === 'undefined') {
    new Error("Missing / not loaded jquery.couch.js !!");
  }

  Backbone.couch = {
    VERSION: "0.0.1",

    // turn on/off logger
    debug: false,

    // enable / disable handling changes
    enableChangesFeed: true,

    // define database name
    databaseName : null,

    // define design doc name
    ddocName : null,

    // define base url
    baseUrl : null,

    // list of collections to keep track
    _watchList : {},

    /**
     * return database instance
     *
     * @return couchdb database object
     * @type Object
     */
    db: function() {
      this.log( "db" );

      if ( !this.databaseName ) { new Error("Missing Backbone.couch.databaseName configuration !!!"); }
      if ( !this.ddocName ) { new Error("Missing Backbone.couch.ddocName configuration !!!"); }

      var db = $.couch.db( this.databaseName );
      if ( this.baseUrl ) {
        db.uri = this.baseUrl + "/" + this.databaseName + "/";

      }
      return db;
    },

    /**
     * show / suppress logger information depends from debug option
     *
     * @param message - string message
     */
    log: function ( message ) {
      if ( this.debug && console && console.log ) {
        console.log( "Backbone.couch - " + message );
      }
    },

    /**
     * create document based on backbone model
     *
     * @param {Backbone.Model} model backbone model
     * @param {function} _success callback
     * @param {function} _error callback
     */
    create: function( model, _success, _error ) {
      this.log( "create" );

      var db = this.db(),
        data = model.toJSON();
      if ( !data.type && model.type ) { data.type = model.type; }
      if ( !data.id && data._id ) { data.id = data._id; }
      db.saveDoc( data, {
        success: function( respone ){
          _success( {
            "id": respone.id,
            "_id": respone.id,
            "_rev": respone.rev
          });
        },
        error: _error
      });
    },

    /**
     * return type of a given collection
     *
     * @param {Backbone.Collection} collection
     *
     * @return type of collection
     * @type String
     */
    getType: function( collection ) {
      // Use the default model type if available
      var type = new collection.model().type;
      // Otherwise use the collection url
      if ( !type ) {
        this.log("Could not determine type of model, falling back to collection");
        type = collection.url;
        if ( !type ) {
          throw new Error( "Could not determine type of model or collection" );
        }
      }
      return type;
    },

    /**
     * return view name from collection view or url property
     *
     * @param {Backbone.Model} collection
     *
     * @return name of view
     * @type String
     */
    getView: function( collection ) {
      if (! collection) throw new Error( "no collection passed to getView" );
      // previously, backbone.couch hijacked the url property to specify
      // the view. It's probably better to just call the attribute 'view' and
      // not bother with url.
      var view = collection.view || collection.url;
      this.log( "getView" );

      if (! view ) {
        throw new Error( "No url property / function!" );
      }
      // if url is function evaluate else use as value
      return _.isFunction( view ) ? view() : view;
    },

    /**
     * return list name from collection list property
     *
     * @param {Backbone.Model} collection
     *
     * @return name of list
     * @type String
     */
    getList: function( collection ) {
      if (! collection) throw new Error( "no collection passed to getList" );
      var list = collection.list;
      this.log( "getList" );

      // if url is function evaluate else use as value
      return _.isFunction( list ) ? list() : list;
    },

    /**
     * remove document from database based on removed backbone model
     *
     * @param {Backbone.Model} model
     * @param {function} _success callback
     * @param {function} _error callback
     */
    remove: function( model, _success, _error ) {
      this.log( "remove" );

      var db = this.db(),
        data = model.toJSON();

      db.removeDoc(data, {
        success: _success,
        error: function (_nr, _req, e) {
          if ( e == "deleted" ) {
            _success();
          } else {
            _error();
          }
        }
      })
    },

    /**
     * fetch collection from couchdb
     *
     * @param {Backbone.Collection} collection
     * @param {function} _success callback
     * @param {function} _error callback
     */
    fetchCollection: function( collection, _success, _error) {
      this.log( "fetchCollection" );

      var db = this.db(),
        viewName = this.getView( collection ),
        listName = this.getList( collection ),
        // build query name
        query = this.ddocName + "/" + (listName || viewName);

      // collections can define their own success/error functions. Success
      // functions return a list of models to pass to the call back or use
      // the default function which assumes the value is the model.
      var options = {
        success: function( result ){
          _success( (collection.success || function( result ) {
            var models = [];
            // for each result row, build model
            // compliant with backbone
            _.each( result.rows, function( row ) {
              var model = row.value;
              if ( !model.id ) { model.id = row.id; }
              models.push( model );
            });
            // if no result then should result null
            if ( models.length == 0 ) { models = null; }
            return models;
          })( result ));
        },
        error: collection.error || _error
      };

      // view options with defaults
      options.descending = collection.descending || false;
      options.skip = parseInt(collection.skip) || 0;

      // the collection couchbdb parameter is named doreduce, as opposed to simply reduce, since reduce is reserved by backbone.
      options.reduce = collection.doreduce == undefined ? true : collection.doreduce;

      // don't define options.group without unless options.reduce is true (since couchdb 1.1.0 blows up on non-reduce views when passing group=false)
      if(options.reduce) options.group = collection.group || false;

      options.include_docs = collection.include_docs || false;
      if(collection.inclusive_end === undefined){
        options.inclusive_end = true;
      } else {
        options.inclusive_end = collection.inclusive_end;
      }
      options.update_seq = collection.update_seq || false;

      // on/off view options
      if (collection.limit) { options.limit = collection.limit; }
      if (collection.key) { options.key = collection.key; }
      if (collection.startkey) { options.startkey = collection.startkey; }
      if (collection.endkey) { options.endkey = collection.endkey; }
      if (collection.startkey_docid) { options.startkey_docid = collection.startkey_docid; }
      if (collection.endkey_docid) { options.endkey_docid = collection.endkey_docid; }
      if (collection.group_level) { options.group_level = collection.group_level; }
      // Only two valid values for stale
      if (_.include(['ok', 'update_after'], collection.stale)) {
        options.stale = collection.stale;
      }

      if(listName) db.list(query, viewName, options, {success: options.success, error: options.error});
      else         db.view(query, options);

      var type = this.getType( collection );
      if ( !this._watchList[ type ] ) {
        this._watchList[ type ] = collection;
      }
    },

    /**
     * fetch model from couchdb
     *
     * @param {Backbone.Model} model
     * @param {function} _success callback
     * @param {function} _error callback
     */
    fetchModel: function( model, _success, _error) {
      this.log( "fetchModel" );

      var db = this.db();
      db.openDoc( model.id, {
        success: function(doc) { _success(doc); },
        error: _error
      });
    },

    /**
     * run changes feed handler
     *
     */
    _changes: function() {
      this.log( "changesFeed" );

      var db = this.db(),
        that = this,
        currentDdoc = "_design/" + this.ddocName;

      db.info( {
        success: function ( data ) {
          var since = ( data.update_seq || 0);
          that.changesFeed = db.changes( since, { include_docs: true, limit:10 } );
          that.changesFeed.onChange( function( changes ) {
            _.each( changes.results, function( row ) {
              var doc = row.doc;
              var handlerDefined = typeof that.ddocChangeHandler === "function";
              var docHandlerDefined = typeof that.docChangeHandler === "function";
              var id = ( doc.id || doc._id );

              if ( handlerDefined  && ( id === currentDdoc )) {
                that.ddocChangeHandler(currentDdoc);
              }

              if ( docHandlerDefined && ( id != currentDdoc)) {
                that.docChangeHandler(id);
              } else if ( doc.type ) {
                var collection = that._watchList[ doc.type ];
                if ( collection ) {
                  var model = collection.get( id );
                  if ( model ) {
                    if ( model && doc._rev != model.get( "_rev" ) ) {
                      model.set(doc);
                    }
                  } else {
                    if ( !doc.id ) { doc.id = doc._id; }
                    collection.add(doc);
                  }
                }
              }
            })
          });
        },
        error: function () {
          that.log("problem with db connection");
          Backbone.couch.startingChanges = false;
        }
      })
    },

    /**
     * add design doc change handler
     *
     * @param {function} callback
     */
    ddocChange: function( callback ) {
      this.log( "ddocChange" );
      this.ddocChangeHandler = callback;
     // run changes feed handler if you have defined ddocChange callback
      if ( this.db() ) { this.runChangesFeed(); }
    },

    /**
     * add regular doc change handler
     *
     * @param {function} callback
     */
    docChange: function( callback ){
      this.log( "docChange" );
      this.docChangeHandler = callback;
    },

    /**
     * remove all data from couchdb database
     * except current design document.
     */
    destroyAllData : function() {
      this.log( "ddocChange" );

      var db = this.db(),
        currentDoc = "_design/" + this.ddocName;

      db.allDocs({
        success: function( result ) {
          var docs = _.select( result.rows, function( doc ) {
            return doc.id !== currentDoc;
          });

          if (docs.length > 0) {
            var toRemove = _.map( docs, function( doc ) {
              return { "_rev": doc.value.rev, "_id": doc.id };
            });
            db.bulkRemove({ docs:toRemove }, {
              success: function() {},
              error: function() {}
            });
          }
        }
      });
    },

    /**
     * run changes feed depends from options
     */
    runChangesFeed: function() {
      // run changes changes feed handler
      if( Backbone.couch.enableChangesFeed && !Backbone.couch.changesFeed
          && !Backbone.couch.startingChanges ) {
        Backbone.couch.startingChanges = true;
        Backbone.couch._changes();
      }
    }
  };

  /**
   * Overrides Backbone.sync function to change the manner in which Backbone persists
   * models to the server.
   *
   * @param {String} method "create" | "update" | "delete" | "read"
   * @param {Object} obj model or collection which should by synch
   * @param {function} options object containing success and error callbacks
   */
  Backbone.sync = function(method, obj, options) {
    if ( method === "create" || method === "update" ) {
      // triggered on "model.save(...)"
      Backbone.couch.create( obj, options.success, options.error );
    } else if ( method === "delete" ) {
      // triggered on "model.destroy(...)"
      Backbone.couch.remove( obj, options.success, options.error );
    } else if ( method === "read" ) {
      // depends from where sync is called
      if ( obj.model ) {
        // triggered on "collection.fetch(...)"
        Backbone.couch.fetchCollection( obj, options.success, options.error );
      } else {
        // triggered on "model.fetch(...)"
        Backbone.couch.fetchModel( obj, options.success, options.error );
      }
    }
    // run changes feed handler if not run yet
    Backbone.couch.runChangesFeed();
  };

})();
