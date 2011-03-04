function(doc) {
  if (doc.type == "logger") {
    emit(doc.created_at, doc);
  }
}
