type DeletableResource = {
  delete(): void;
};

export function retainValidatedResource<T extends DeletableResource>(
  resource: T,
  validate: (resource: T) => void,
): T {
  try {
    validate(resource);
    return resource;
  } catch (error) {
    resource.delete();
    throw error;
  }
}

export function commitPreparedResource<T extends DeletableResource, Prepared>(
  resource: T,
  prepare: (resource: T) => Prepared,
  adopt: (resource: T) => void,
): Prepared {
  try {
    const prepared = prepare(resource);
    adopt(resource);
    return prepared;
  } catch (error) {
    resource.delete();
    throw error;
  }
}

export async function commitPreparedResourceAsync<
  T extends DeletableResource,
  Prepared,
>(
  resource: T,
  prepare: (resource: T) => Promise<Prepared>,
  adopt: (resource: T) => void,
): Promise<Prepared> {
  try {
    const prepared = await prepare(resource);
    adopt(resource);
    return prepared;
  } catch (error) {
    resource.delete();
    throw error;
  }
}
