# Database

Database design documents will live here.

Planned topics:

- Entity relationship model
- Inventory state model
- Inbound and outbound transaction design
- Audit log schema
- Migration strategy

Current documents:

- `01-database-overview.md`: local PostgreSQL/Redis direction, Prisma ownership boundary, and next database documentation steps.
- `02-entity-relationship.md`: core phase 2 entity relationships and ownership boundaries.
- `03-inventory-state-machine.md`: allowed inventory status transitions and transaction rules.
- `04-audit-log-schema.md`: audit log fields, audited operations, and writing rules.
- `05-inbound-inventory-transaction.md`: phase-seven inbound draft to inventory transaction boundary.
- `06-outbound-transaction.md`: phase-ten outbound add, remove, clear, and seal transaction boundaries.
