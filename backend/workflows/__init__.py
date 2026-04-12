"""Cross-module workflow helpers.

Currently only exposes the relationship graph used by
``services.related_service.RelatedService`` to answer
``GET /{module}/{id}/related`` requests. Future phases of the
cross-module workflow initiative (see ``BACKLOG.md`` item #11) will
grow this package with rule engines and event emitters.
"""
