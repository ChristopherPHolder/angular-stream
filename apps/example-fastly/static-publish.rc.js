/** @type {import('@fastly/compute-js-static-publish').StaticPublishRc} */
const rc = {
  storageMode: 'kv-store',
  kvStore: { kvStoreName: 'example-content' },
  publishId: 'default',
  defaultCollectionName: 'live',
  staticPublisherWorkingDir: './static-publisher',
};

export default rc;
