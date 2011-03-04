describe("CouchWatch JavaScript Client", function() {

  it("it should be available", function () {
    expect(couchwatch.enableCouchWatch).toBeDefined();
  });

  it("should push logs to CouchWatch Service", function () {

    runs(function() {
      window.Items = new ItemsList();

      couchwatch.enableCouchWatch("http://localhost:5984/couchwatch-test");
      couchwatch.debug("ello");
    });

    waitsFor(function() {
      Items.fetch();
      return Items.length > 0;
    },"", 10000);

    runs(function(){
      expect(Items.first().get("message")).toEqual("ello");
    });
  })
});



