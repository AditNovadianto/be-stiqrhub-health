import { db } from "../config/db.js";

// HELPERS
const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const isPositiveId = (value) => {
  const id = Number(value);

  return Number.isSafeInteger(id) && id > 0;
};

export const normalizeProviderIds = (providerIds) => {
  if (
    !Array.isArray(providerIds) ||
    providerIds.some((id) => !isPositiveId(id))
  ) {
    throw createError(
      400,
      "provider_ids harus berupa array ID provider yang valid.",
    );
  }

  const uniqueIds = [...new Set(providerIds.map(Number))];

  if (uniqueIds.length > 1000) {
    throw createError(400, "Maksimal 1000 provider per request.");
  }

  return uniqueIds;
};

// GET ALL PROVIDER GROUPS
export const getAllProviderGroups = async () => {
  const [rows] = await db.query(`
    SELECT
      pg.id_provider_group,
      pg.name_provider_group,
      pg.status_provider_group,
      COUNT(p.id_provider) AS total_providers
    FROM provider_groups pg
    LEFT JOIN providers p
      ON p.id_provider_group = pg.id_provider_group
    GROUP BY
      pg.id_provider_group,
      pg.name_provider_group,
      pg.status_provider_group
    ORDER BY
      pg.name_provider_group ASC,
      pg.id_provider_group ASC
  `);

  return rows;
};

// GET PROVIDER GROUP BY ID
export const getProviderGroupById = async (idProviderGroup) => {
  const [groups] = await db.query(
    `
    SELECT
      id_provider_group,
      name_provider_group,
      status_provider_group
    FROM provider_groups
    WHERE id_provider_group = ?
    LIMIT 1
    `,
    [idProviderGroup],
  );

  if (groups.length === 0) {
    throw createError(404, "Provider group tidak ditemukan.");
  }

  const [providers] = await db.query(
    `
    SELECT
      id_provider,
      name_provider,
      email_provider,
      phone_number_provider,
      address_provider,
      province_provider,
      city_provider,
      district_provider,
      status_provider,
      id_provider_group
    FROM providers
    WHERE id_provider_group = ?
    ORDER BY name_provider ASC
    `,
    [idProviderGroup],
  );

  return {
    ...groups[0],
    total_providers: providers.length,
    providers,
  };
};

// LOCK PROVIDER GROUP
const lockProviderGroup = async (
  connection,
  idProviderGroup,
  requireActive = false,
) => {
  const [rows] = await connection.query(
    `
    SELECT
      id_provider_group,
      name_provider_group,
      status_provider_group
    FROM provider_groups
    WHERE id_provider_group = ?
    FOR UPDATE
    `,
    [idProviderGroup],
  );

  if (rows.length === 0) {
    throw createError(404, "Provider group tidak ditemukan.");
  }

  const group = rows[0];

  if (requireActive && group.status_provider_group !== "ACTIVE") {
    throw createError(409, "Provider group tidak aktif.");
  }

  return group;
};

// ATTACH MULTIPLE PROVIDERS
const attachProviders = async (connection, idProviderGroup, providerIds) => {
  if (providerIds.length === 0) return;

  const [providers] = await connection.query(
    `
    SELECT
      id_provider,
      name_provider,
      id_provider_group
    FROM providers
    WHERE id_provider IN (?)
    ORDER BY id_provider ASC
    FOR UPDATE
    `,
    [providerIds],
  );

  if (providers.length !== providerIds.length) {
    throw createError(404, "Satu atau beberapa provider tidak ditemukan.");
  }

  const conflict = providers.find(
    (provider) =>
      provider.id_provider_group !== null &&
      Number(provider.id_provider_group) !== Number(idProviderGroup),
  );

  if (conflict) {
    throw createError(
      409,
      `Provider "${conflict.name_provider}" sudah menjadi anggota provider group lain.`,
    );
  }

  await connection.query(
    `
    UPDATE providers
    SET id_provider_group = ?
    WHERE id_provider IN (?)
      AND (
        id_provider_group IS NULL
        OR id_provider_group = ?
      )
    `,
    [idProviderGroup, providerIds, idProviderGroup],
  );
};

// CREATE PROVIDER GROUP
export const createProviderGroup = async ({
  name_provider_group,
  provider_ids = [],
}) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [duplicates] = await connection.query(
      `
      SELECT id_provider_group
      FROM provider_groups
      WHERE LOWER(TRIM(name_provider_group)) =
            LOWER(TRIM(?))
      LIMIT 1
      `,
      [name_provider_group],
    );

    if (duplicates.length > 0) {
      throw createError(409, "Nama provider group sudah terdaftar.");
    }

    const [result] = await connection.query(
      `
      INSERT INTO provider_groups (
        name_provider_group,
        status_provider_group
      )
      VALUES (?, 'ACTIVE')
      `,
      [name_provider_group],
    );

    const idProviderGroup = result.insertId;

    await attachProviders(connection, idProviderGroup, provider_ids);

    await connection.commit();

    return await getProviderGroupById(idProviderGroup);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// UPDATE PROVIDER GROUP
export const updateProviderGroup = async (
  idProviderGroup,
  { name_provider_group, status_provider_group },
) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    await lockProviderGroup(connection, idProviderGroup);

    if (name_provider_group !== undefined) {
      const [duplicates] = await connection.query(
        `
        SELECT id_provider_group
        FROM provider_groups
        WHERE LOWER(TRIM(name_provider_group)) =
              LOWER(TRIM(?))
          AND id_provider_group <> ?
        LIMIT 1
        `,
        [name_provider_group, idProviderGroup],
      );

      if (duplicates.length > 0) {
        throw createError(409, "Nama provider group sudah digunakan.");
      }
    }

    await connection.query(
      `
      UPDATE provider_groups
      SET
        name_provider_group =
          COALESCE(?, name_provider_group),
        status_provider_group =
          COALESCE(?, status_provider_group)
      WHERE id_provider_group = ?
      `,
      [
        name_provider_group ?? null,
        status_provider_group ?? null,
        idProviderGroup,
      ],
    );

    await connection.commit();

    return await getProviderGroupById(idProviderGroup);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// ADD MULTIPLE PROVIDERS TO GROUP
export const addProvidersToGroup = async (idProviderGroup, providerIds) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    await lockProviderGroup(connection, idProviderGroup, true);

    await attachProviders(connection, idProviderGroup, providerIds);

    await connection.commit();

    return await getProviderGroupById(idProviderGroup);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// REMOVE PROVIDER FROM GROUP
export const removeProviderFromGroup = async (idProviderGroup, idProvider) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    await lockProviderGroup(connection, idProviderGroup);

    const [result] = await connection.query(
      `
      UPDATE providers
      SET id_provider_group = NULL
      WHERE id_provider = ?
        AND id_provider_group = ?
      `,
      [idProvider, idProviderGroup],
    );

    if (result.affectedRows === 0) {
      throw createError(404, "Provider bukan anggota group tersebut.");
    }

    await connection.commit();

    return await getProviderGroupById(idProviderGroup);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// DEACTIVATE PROVIDER GROUP
export const deleteProviderGroup = async (idProviderGroup) => {
  // Soft delete agar relasi provider tetap terjaga.
  return await updateProviderGroup(idProviderGroup, {
    status_provider_group: "INACTIVE",
  });
};

// GET PROVIDERS ELIGIBLE FOR GROUP
export const getEligibleProviders = async (idProviderGroup) => {
  const [groups] = await db.query(
    `
    SELECT id_provider_group
    FROM provider_groups
    WHERE id_provider_group = ?
    `,
    [idProviderGroup],
  );

  if (groups.length === 0) {
    throw createError(404, "Provider group tidak ditemukan.");
  }

  const [providers] = await db.query(
    `
    SELECT
      id_provider,
      name_provider,
      city_provider,
      status_provider,
      id_provider_group
    FROM providers
    WHERE
      id_provider_group IS NULL
      OR id_provider_group = ?
    ORDER BY name_provider ASC
    `,
    [idProviderGroup],
  );

  return providers;
};

// FIND ALTERNATIVE BRANCHES BY SERVICE
export const getBranchesByService = async (idService) => {
  // Cari layanan asal dan group provider-nya.
  const [services] = await db.query(
    `
    SELECT
      s.id_service,
      s.name_service,
      s.id_provider,
      p.name_provider,
      p.id_provider_group
    FROM services s
    INNER JOIN providers p
      ON p.id_provider = s.id_provider
    WHERE s.id_service = ?
    LIMIT 1
    `,
    [idService],
  );

  if (services.length === 0) {
    throw createError(404, "Layanan tidak ditemukan.");
  }

  const origin = services[0];

  if (!origin.id_provider_group) {
    return {
      origin,
      branches: [],
    };
  }

  // Provider lain dalam group yang sama,
  // dengan nama layanan yang sama.
  const [branches] = await db.query(
    `
    SELECT
      s.id_service,
      s.name_service,
      s.price_service,
      s.quota_service,
      s.status_service,
      s.image_service,
      s.maps_service,

      p.id_provider,
      p.name_provider,
      p.address_provider,
      p.province_provider,
      p.city_provider,
      p.district_provider,
      p.status_provider,

      pg.id_provider_group,
      pg.name_provider_group

    FROM services s

    INNER JOIN providers p
      ON p.id_provider = s.id_provider

    INNER JOIN provider_groups pg
      ON pg.id_provider_group = p.id_provider_group

    WHERE p.id_provider_group = ?
      AND p.id_provider <> ?
      AND LOWER(TRIM(s.name_service)) =
          LOWER(TRIM(?))
      AND s.status_service = 'ACTIVE'
      AND pg.status_provider_group = 'ACTIVE'

    ORDER BY
      p.name_provider ASC,
      s.id_service ASC
    `,
    [origin.id_provider_group, origin.id_provider, origin.name_service],
  );

  return {
    origin,
    branches,
  };
};
