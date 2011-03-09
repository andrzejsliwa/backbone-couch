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
    new Error("Missing Backbone.js !!");
  }

  Backbone.couch = {

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
      if ( !data.type ) { data.type = this.getType( model ); }
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
     * return type stored in model url property
     *
     * @param {Backbone.Model} model
     *
     * @return type of model
     * @type String
     */
    getType: function( model ) {
      return model.url;
    },

    /**
     * return view name from collection url property
     *
     * @param {Backbone.Model} collection
     *
     * @return name of view
     * @type String
     */
    getView: function( collection ) {
      this.log( "getViewName" );

      if (!( collection && collection.url )) {
        throw new Error( "No url property / function!" );
      }
      // if url is function evaluate else use as value
      return _.isFunction( collection.url ) ? collection.url() : collection.url;
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
        // retrive view name from 'url' of collection
        viewName = this.getView( collection ),
        // build query name
        query = this.ddocName + "/" + viewName;
      // if descending not defined set default false
      collection.descending || ( collection.descending = false );

      var options = {
        descending: collection.descending,
        success: function( result ) {
          var models = [];
          // for each result row, build model
          // compilant with backbone
          _.each( result.rows, function( row ) {
            var model = row.value;
            if ( !model.id ) { model.id = row.id }
            models.push( model );
          });
          // if no result then should result null
          if ( models.length == 0 ) { models = null }
          _success( models );
        },
        error: _error
      };
      if (collection.limit) { options.limit = collection.limit; }
      db.view(query, options);

      var model = new collection.model;
      if (! model.url ) {
        throw new Error( "No 'url' property on collection.model!" );
      }

      var type = this.getType(new collection.model);
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
              var id = ( doc.id || doc._id );

              if ( handlerDefined  && ( id === currentDdoc )) {
                that.ddocChangeHandler(currentDdoc);
              }

              if ( doc.type ) {
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
     * remove all date from couchdb database
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
      if( Backbone.couch.enableChangesFeed && !Backbone.couch.changesFeed ) {
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
   * @param {function} success callback
   * @param {function} error callback
   */
  Backbone.sync = function(method, obj, success, error) {

    if ( method === "create" || method === "update" ) {
      // triggered on "model.save(...)"
      Backbone.couch.create( obj, success, error );
    } else if ( method === "delete" ) {
      // triggered on "model.destroy(...)"
      Backbone.couch.remove( obj, success, error );
    } else if ( method === "read" ) {
      // depends from where sync is called
      if ( obj.model ) {
        // triggered on "collection.fetch(...)"
        Backbone.couch.fetchCollection( obj, success, error );
      } else {
        // triggered on "model.fetch(...)"
        Backbone.couch.fetchModel( obj, success, error );
      }
    }
    // run changes feed handler if not run yet
    Backbone.couch.runChangesFeed();
  };

})();
