-- Migration 057: Add composite FK from entity_projects → permits
-- Enables Drizzle relational queries: Permit → associated Entities (Builder, Architect, etc.)

-- UP
ALTER TABLE entity_projects
  ADD CONSTRAINT fk_entity_projects_permits
  FOREIGN KEY (permit_num, revision_num)
  REFERENCES permits(permit_num, revision_num);

-- DOWN
-- ALTER TABLE entity_projects DROP CONSTRAINT IF EXISTS fk_entity_projects_permits;
