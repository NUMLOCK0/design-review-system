import type { Pool } from 'mysql2/promise';

export async function ensureImageStudioSchema(pool: Pool) {
  const definitions = [
    `CREATE TABLE IF NOT EXISTS image_studio_projects (
      id VARCHAR(64) PRIMARY KEY, owner_id VARCHAR(64) NOT NULL, organization_id VARCHAR(64),
      name VARCHAR(160) NOT NULL, platform VARCHAR(48) NULL, status VARCHAR(24) NOT NULL DEFAULT 'active',
      workflow_json JSON NOT NULL, version INT NOT NULL DEFAULT 1,
      created_at DATETIME(3) NOT NULL, updated_at DATETIME(3) NOT NULL, deleted_at DATETIME(3) NULL,
      KEY idx_isp_owner_updated (owner_id, deleted_at, updated_at), KEY idx_isp_org_updated (organization_id, deleted_at, updated_at)
    )`,
    `CREATE TABLE IF NOT EXISTS image_studio_assets (
      id VARCHAR(64) PRIMARY KEY, project_id VARCHAR(64) NOT NULL, owner_id VARCHAR(64) NOT NULL,
      media_asset_id VARCHAR(64) NULL, kind VARCHAR(32) NOT NULL, role VARCHAR(48) NOT NULL,
      object_key VARCHAR(768) NOT NULL, filename VARCHAR(255) NOT NULL, mime_type VARCHAR(128) NOT NULL,
      size_bytes BIGINT UNSIGNED NOT NULL, checksum_sha256 CHAR(64) NULL, width INT NULL, height INT NULL,
      catalog_json JSON NULL, source VARCHAR(16) NOT NULL DEFAULT 'upload',
      created_at DATETIME(3) NOT NULL, deleted_at DATETIME(3) NULL,
      UNIQUE KEY uq_isa_project_asset (project_id, media_asset_id),
      KEY idx_isa_project_created (project_id, deleted_at, created_at), KEY idx_isa_owner (owner_id)
    )`,
    `CREATE TABLE IF NOT EXISTS image_studio_asset_annotations (
      id VARCHAR(64) PRIMARY KEY, project_id VARCHAR(64) NOT NULL, owner_id VARCHAR(64) NOT NULL,
      asset_id VARCHAR(64) NOT NULL, ai_json JSON NULL, manual_json JSON NOT NULL,
      source_job_id VARCHAR(64) NULL, version INT NOT NULL DEFAULT 1,
      created_at DATETIME(3) NOT NULL, updated_at DATETIME(3) NOT NULL,
      UNIQUE KEY uq_isaa_asset (asset_id), KEY idx_isaa_project (project_id, owner_id, updated_at), KEY idx_isaa_source_job (source_job_id)
    )`,
    `CREATE TABLE IF NOT EXISTS image_studio_jobs (
      id VARCHAR(64) PRIMARY KEY, project_id VARCHAR(64) NOT NULL, owner_id VARCHAR(64) NOT NULL,
      job_type VARCHAR(32) NOT NULL, status VARCHAR(24) NOT NULL, idempotency_key VARCHAR(128) NOT NULL,
      request_json JSON NOT NULL, result_json JSON NULL, model_profile_id VARCHAR(64) NULL,
      progress SMALLINT UNSIGNED NOT NULL DEFAULT 0, attempt_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
      error_code VARCHAR(64) NULL, error_message VARCHAR(768) NULL,
      created_at DATETIME(3) NOT NULL, started_at DATETIME(3) NULL, completed_at DATETIME(3) NULL,
      updated_at DATETIME(3) NOT NULL,
      UNIQUE KEY uq_isj_owner_idempotency (owner_id, idempotency_key),
      KEY idx_isj_project_created (project_id, created_at), KEY idx_isj_owner_status (owner_id, status, created_at),
      KEY idx_isj_status_updated (status, updated_at)
    )`,
    `CREATE TABLE IF NOT EXISTS image_studio_chat_intakes (
      id VARCHAR(64) PRIMARY KEY, project_id VARCHAR(64) NOT NULL, owner_id VARCHAR(64) NOT NULL,
      source_asset_ids JSON NOT NULL, source_type VARCHAR(24) NOT NULL DEFAULT 'screenshots', source_conversation_id VARCHAR(64) NULL,
      source_data_json JSON NULL, brief_json JSON NULL, status VARCHAR(24) NOT NULL DEFAULT 'queued',
      version INT NOT NULL DEFAULT 1, error_code VARCHAR(64) NULL, error_message VARCHAR(768) NULL,
      reviewed_by VARCHAR(64) NULL, reviewed_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL, updated_at DATETIME(3) NOT NULL,
      KEY idx_isci_project_status (project_id,owner_id,status,created_at), KEY idx_isci_owner_created (owner_id,created_at),
      KEY idx_isci_source_conversation (source_type,source_conversation_id,created_at)
    )`,
    `CREATE TABLE IF NOT EXISTS image_studio_plan_runs (
      id VARCHAR(64) PRIMARY KEY, job_id VARCHAR(64) NOT NULL, project_id VARCHAR(64) NOT NULL, owner_id VARCHAR(64) NOT NULL,
      source_type VARCHAR(24) NOT NULL, source_conversation_id VARCHAR(64) NOT NULL, source_snapshot_json JSON NOT NULL, model_profile_ids_json JSON NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'queued', error_code VARCHAR(64) NULL, error_message VARCHAR(768) NULL,
      created_at DATETIME(3) NOT NULL, updated_at DATETIME(3) NOT NULL, completed_at DATETIME(3) NULL,
      UNIQUE KEY uq_ispr_job (job_id), KEY idx_ispr_project (project_id,owner_id,created_at),
      KEY idx_ispr_source (source_type,source_conversation_id,created_at)
    )`,
    `CREATE TABLE IF NOT EXISTS image_studio_plan_versions (
      id VARCHAR(64) PRIMARY KEY, run_id VARCHAR(64) NOT NULL, project_id VARCHAR(64) NOT NULL, owner_id VARCHAR(64) NOT NULL,
      version INT UNSIGNED NOT NULL, plan_json JSON NOT NULL, status VARCHAR(24) NOT NULL DEFAULT 'needs_review',
      reviewed_by VARCHAR(64) NULL, reviewed_at DATETIME(3) NULL, created_at DATETIME(3) NOT NULL, updated_at DATETIME(3) NOT NULL,
      UNIQUE KEY uq_ispv_run_version (run_id,version), KEY idx_ispv_project (project_id,owner_id,created_at)
    )`,
    `CREATE TABLE IF NOT EXISTS image_studio_plan_exports (
      id VARCHAR(64) PRIMARY KEY, plan_version_id VARCHAR(64) NOT NULL, project_id VARCHAR(64) NOT NULL, owner_id VARCHAR(64) NOT NULL,
      format VARCHAR(8) NOT NULL, object_key VARCHAR(768) NOT NULL, checksum_sha256 CHAR(64) NOT NULL,
      created_at DATETIME(3) NOT NULL, KEY idx_ispe_version (plan_version_id,format,created_at)
    )`,
    `CREATE TABLE IF NOT EXISTS image_studio_generations (
      id VARCHAR(64) PRIMARY KEY, job_id VARCHAR(64) NOT NULL, project_id VARCHAR(64) NOT NULL,
      slot_key VARCHAR(128) NOT NULL, shot_id VARCHAR(64) NULL, prompt LONGTEXT NOT NULL,
      reference_asset_ids JSON NOT NULL, model_profile_id VARCHAR(64) NULL, model_name VARCHAR(160) NOT NULL,
      parameters_json JSON NOT NULL, status VARCHAR(24) NOT NULL, upstream_task_id VARCHAR(192) NULL,
      output_asset_id VARCHAR(64) NULL, output_object_key VARCHAR(768) NULL, error_code VARCHAR(64) NULL, error_message VARCHAR(768) NULL,
      usage_json JSON NULL, cost_estimate DECIMAL(12,6) NULL,
      created_at DATETIME(3) NOT NULL, started_at DATETIME(3) NULL, completed_at DATETIME(3) NULL,
      UNIQUE KEY uq_isg_job_slot (job_id, slot_key), KEY idx_isg_project_created (project_id, created_at),
      KEY idx_isg_upstream_task (upstream_task_id)
    )`,
    `CREATE TABLE IF NOT EXISTS image_studio_generation_reviews (
      generation_id VARCHAR(64) PRIMARY KEY, project_id VARCHAR(64) NOT NULL, owner_id VARCHAR(64) NOT NULL,
      is_selected BOOLEAN NOT NULL DEFAULT FALSE, is_locked BOOLEAN NOT NULL DEFAULT FALSE,
      version INT NOT NULL DEFAULT 1, reviewed_by VARCHAR(64) NULL, reviewed_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL, updated_at DATETIME(3) NOT NULL,
      KEY idx_isgr_project_selection (project_id,owner_id,is_selected,updated_at)
    )`,
    `CREATE TABLE IF NOT EXISTS image_studio_exports (
      id VARCHAR(64) PRIMARY KEY, job_id VARCHAR(64) NOT NULL, project_id VARCHAR(64) NOT NULL, owner_id VARCHAR(64) NOT NULL,
      manifest_json JSON NOT NULL, object_key VARCHAR(768) NULL, image_count SMALLINT UNSIGNED NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'queued', error_code VARCHAR(64) NULL, error_message VARCHAR(768) NULL,
      created_at DATETIME(3) NOT NULL, updated_at DATETIME(3) NOT NULL, completed_at DATETIME(3) NULL,
      UNIQUE KEY uq_ise_job (job_id), KEY idx_ise_project_created (project_id,owner_id,created_at)
    )`,
    `CREATE TABLE IF NOT EXISTS image_studio_job_events (
      event_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, job_id VARCHAR(64) NOT NULL,
      project_id VARCHAR(64) NOT NULL, owner_id VARCHAR(64) NOT NULL, event_type VARCHAR(48) NOT NULL,
      payload_json JSON NOT NULL, created_at DATETIME(3) NOT NULL,
      KEY idx_isje_owner_cursor (owner_id, event_id), KEY idx_isje_project_cursor (project_id, event_id),
      KEY idx_isje_job_cursor (job_id, event_id)
    )`,
    `CREATE TABLE IF NOT EXISTS image_studio_outbox (
      id VARCHAR(64) PRIMARY KEY, job_id VARCHAR(64) NOT NULL, queue_name VARCHAR(96) NOT NULL,
      job_name VARCHAR(64) NOT NULL, payload_json JSON NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'pending',
      attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0, available_at DATETIME(3) NOT NULL,
      locked_until DATETIME(3) NULL, dispatched_at DATETIME(3) NULL, last_error VARCHAR(768) NULL,
      created_at DATETIME(3) NOT NULL,
      UNIQUE KEY uq_iso_job (job_id), KEY idx_iso_dispatch (status, available_at, created_at)
    )`,
    `CREATE TABLE IF NOT EXISTS image_studio_model_profiles (
      id VARCHAR(64) PRIMARY KEY, name VARCHAR(120) NOT NULL, capability VARCHAR(16) NOT NULL,
      ai_config_id VARCHAR(64) NOT NULL, protocol VARCHAR(32) NOT NULL, model_override VARCHAR(160) NULL,
      options_json JSON NOT NULL, enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_by VARCHAR(64) NOT NULL, created_at DATETIME(3) NOT NULL, updated_at DATETIME(3) NOT NULL,
      KEY idx_ismp_capability (capability, enabled, name), KEY idx_ismp_config (ai_config_id)
    )`,
    `CREATE TABLE IF NOT EXISTS image_studio_creative_directions (
      id VARCHAR(64) PRIMARY KEY, project_id VARCHAR(64) NOT NULL, owner_id VARCHAR(64) NOT NULL,
      dimension_key VARCHAR(32) NOT NULL, selected_json JSON NOT NULL, custom_json JSON NOT NULL,
      version INT NOT NULL DEFAULT 1, created_at DATETIME(3) NOT NULL, updated_at DATETIME(3) NOT NULL,
      UNIQUE KEY uq_iscd_project_dimension (project_id, dimension_key),
      KEY idx_iscd_owner_project (owner_id, project_id)
    )`,
    `CREATE TABLE IF NOT EXISTS image_studio_creative_candidates (
      id VARCHAR(64) PRIMARY KEY, project_id VARCHAR(64) NOT NULL, owner_id VARCHAR(64) NOT NULL,
      dimension_key VARCHAR(32) NOT NULL, candidate_text VARCHAR(1000) NOT NULL, candidate_hash CHAR(64) NOT NULL,
      source_job_id VARCHAR(64) NULL, candidate_index SMALLINT UNSIGNED NOT NULL DEFAULT 0,
      status VARCHAR(16) NOT NULL DEFAULT 'pending', created_at DATETIME(3) NOT NULL,
      UNIQUE KEY uq_iscc_source_index (source_job_id, dimension_key, candidate_index),
      KEY idx_iscc_owner_project_status (owner_id, project_id, status, created_at),
      KEY idx_iscc_source_job (source_job_id), KEY idx_iscc_hash (project_id, dimension_key, candidate_hash)
    )`,
    `CREATE TABLE IF NOT EXISTS image_studio_audit_logs (
      id VARCHAR(64) PRIMARY KEY, actor_id VARCHAR(64) NOT NULL, project_id VARCHAR(64) NULL,
      action VARCHAR(64) NOT NULL, entity_id VARCHAR(64) NULL, details_json JSON NOT NULL,
      request_id VARCHAR(96) NULL, created_at DATETIME(3) NOT NULL,
      KEY idx_isal_project_created (project_id, created_at), KEY idx_isal_actor_created (actor_id, created_at)
    )`,
  ];

  for (const sql of definitions) {
    await pool.query(`${sql} ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }

  // CREATE TABLE IF NOT EXISTS does not evolve tables created by earlier releases.
  // Serialize these additive changes because API instances may start together.
  const connection = await pool.getConnection();
  const migrationLock = 'image_studio_schema_migrations_v1';
  let hasMigrationLock = false;
  try {
    const [lockRows]: any = await connection.query('SELECT GET_LOCK(?, 30) AS acquired', [migrationLock]);
    hasMigrationLock = Number(lockRows[0]?.acquired) === 1;
    if (!hasMigrationLock) throw new Error('Could not acquire Image Studio schema migration lock');

    const [intakeColumns]: any = await connection.query("SHOW COLUMNS FROM image_studio_chat_intakes LIKE 'source_type'");
    if (!intakeColumns.length) await connection.query(`ALTER TABLE image_studio_chat_intakes
      ADD COLUMN source_type VARCHAR(24) NOT NULL DEFAULT 'screenshots' AFTER source_asset_ids`);
    const [conversationColumns]: any = await connection.query("SHOW COLUMNS FROM image_studio_chat_intakes LIKE 'source_conversation_id'");
    if (!conversationColumns.length) await connection.query(`ALTER TABLE image_studio_chat_intakes
      ADD COLUMN source_conversation_id VARCHAR(64) NULL AFTER source_type`);
    const [sourceDataColumns]: any = await connection.query("SHOW COLUMNS FROM image_studio_chat_intakes LIKE 'source_data_json'");
    if (!sourceDataColumns.length) await connection.query(`ALTER TABLE image_studio_chat_intakes
      ADD COLUMN source_data_json JSON NULL AFTER source_conversation_id`);
    const [planModelColumns]: any = await connection.query("SHOW COLUMNS FROM image_studio_plan_runs LIKE 'model_profile_ids_json'");
    if (!planModelColumns.length) await connection.query(`ALTER TABLE image_studio_plan_runs ADD COLUMN model_profile_ids_json JSON NULL AFTER source_snapshot_json`);
    const [intakeIndexes]: any = await connection.query('SHOW INDEX FROM image_studio_chat_intakes');
    if (!intakeIndexes.some((row: any) => row.Key_name === 'idx_isci_source_conversation')) {
      await connection.query(`ALTER TABLE image_studio_chat_intakes
        ADD KEY idx_isci_source_conversation (source_type,source_conversation_id,created_at)`);
    }

    const [candidateColumns]: any = await connection.query("SHOW COLUMNS FROM image_studio_creative_candidates LIKE 'candidate_index'");
    if (!candidateColumns.length) {
      await connection.query(`ALTER TABLE image_studio_creative_candidates
        ADD COLUMN candidate_index SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER source_job_id`);
    }

    let [candidateIndexes]: any = await connection.query('SHOW INDEX FROM image_studio_creative_candidates');
    const hasSourceIndex = candidateIndexes.some((row: any) => row.Key_name === 'uq_iscc_source_index');
    if (!hasSourceIndex) {
      const [legacyCandidates]: any = await connection.query(`SELECT id,source_job_id,dimension_key
        FROM image_studio_creative_candidates WHERE source_job_id IS NOT NULL
        ORDER BY source_job_id,dimension_key,created_at,id`);
      const reindexed: Array<{ id: string; index: number }> = [];
      let currentGroup = '';
      let candidateIndex = -1;
      for (const row of legacyCandidates) {
        const group = `${row.source_job_id}\u0000${row.dimension_key}`;
        candidateIndex = group === currentGroup ? candidateIndex + 1 : 0;
        currentGroup = group;
        reindexed.push({ id: String(row.id), index: candidateIndex });
      }
      for (let start = 0; start < reindexed.length; start += 200) {
        const batch = reindexed.slice(start, start + 200);
        const cases = batch.map(() => 'WHEN ? THEN ?').join(' ');
        const ids = batch.map(({ id }) => id);
        const params = [...batch.flatMap(({ id, index }) => [id, index]), ...ids];
        await connection.query(`UPDATE image_studio_creative_candidates
          SET candidate_index=CASE id ${cases} ELSE candidate_index END
          WHERE id IN (${ids.map(() => '?').join(',')})`, params);
      }
      await connection.query(`ALTER TABLE image_studio_creative_candidates
        ADD UNIQUE KEY uq_iscc_source_index (source_job_id,dimension_key,candidate_index)`);
    }

    candidateIndexes = (await connection.query('SHOW INDEX FROM image_studio_creative_candidates'))[0] as any[];
    if (candidateIndexes.some((row: any) => row.Key_name === 'uq_iscc_project_dimension_hash')) {
      await connection.query('ALTER TABLE image_studio_creative_candidates DROP INDEX uq_iscc_project_dimension_hash');
    }
    if (!candidateIndexes.some((row: any) => row.Key_name === 'idx_iscc_hash')) {
      await connection.query(`ALTER TABLE image_studio_creative_candidates
        ADD KEY idx_iscc_hash (project_id,dimension_key,candidate_hash)`);
    }
  } finally {
    if (hasMigrationLock) {
      try { await connection.query('SELECT RELEASE_LOCK(?)', [migrationLock]); } catch { /* release on connection close */ }
    }
    connection.release();
  }
}
