export interface HumanDetectionModel {
  /** Existing SDK FS path supplied by the customer. */
  modelFilePath: string;
  /** Existing SDK FS license path when required by the model/vendor. */
  licenseFilePath?: string;
  /** Verified NvsHumanDetectionFeatureEnum bitmask for this exact model. */
  features: number;
}

export interface HumanDetectionData {
  /** Verified NvsHumanDetectionDataTypeEnum value for this exact data file. */
  dataType: number;
  /** Existing SDK FS path supplied by the customer. */
  dataFilePath: string;
}

export interface HumanDetectionSession {
  context: NvsStreamingContext;
  assertReady(): void;
  supports(featureMask: number): boolean;
  hasData(dataType: number): boolean;
  dispose(): void;
}

interface ActiveHumanDetection {
  context: NvsStreamingContext;
  signature: string;
  references: number;
}

let activeHumanDetection: ActiveHumanDetection | null = null;

function requireSdkFsFile(path: string, label: string): void {
  if (!path || !FS.analyzePath(path).exists) {
    throw new Error(`[missing-external] Provide the matching ${label} in SDK FS before continuing: ${path || '(missing path)'}`);
  }
}

export function initializeHumanDetection(
  context: NvsStreamingContext,
  baseModel: HumanDetectionModel,
  extensionModels: HumanDetectionModel[] = [],
  dataFiles: HumanDetectionData[] = [],
): HumanDetectionSession {
  const models = [baseModel, ...extensionModels];
  for (const model of models) {
    requireSdkFsFile(model.modelFilePath, 'human-detection model');
    if (model.licenseFilePath) requireSdkFsFile(model.licenseFilePath, 'model license');
    if (!Number.isInteger(model.features) || model.features <= 0) {
      throw new Error('[unknown] Supply the documented feature bitmask for each detection model.');
    }
  }
  for (const data of dataFiles) {
    requireSdkFsFile(data.dataFilePath, 'human-detection data file');
    if (!Number.isInteger(data.dataType) || data.dataType < 0) {
      throw new Error('[unknown] Supply the documented data type for each detection data file.');
    }
  }

  const signature = JSON.stringify({
    models: models.map(({ modelFilePath, licenseFilePath = '', features }) => ({ modelFilePath, licenseFilePath, features })),
    dataFiles: dataFiles.map(({ dataType, dataFilePath }) => ({ dataType, dataFilePath })),
  });
  if (activeHumanDetection) {
    if (activeHumanDetection.context !== context || activeHumanDetection.signature !== signature) {
      throw new Error('Human detection is active with a different context or model/data configuration.');
    }
    activeHumanDetection.references += 1;
    return createSession(context, signature, models, dataFiles);
  }

  let initialized = false;
  try {
    if (!context.initHumanDetection(baseModel.modelFilePath, baseModel.licenseFilePath ?? '', baseModel.features)) {
      throw new Error('The SDK rejected the base human-detection model.');
    }
    initialized = true;
    for (const model of extensionModels) {
      if (!context.initHumanDetectionExt(model.modelFilePath, model.licenseFilePath ?? '', model.features)) {
        throw new Error(`The SDK rejected extension model ${model.modelFilePath}.`);
      }
    }
    for (const data of dataFiles) {
      if (!context.setupHumanDetectionData(data.dataType, data.dataFilePath)) {
        throw new Error(`The SDK rejected detection data ${data.dataFilePath}.`);
      }
    }
    activeHumanDetection = { context, signature, references: 1 };
  } catch (error) {
    if (initialized) {
      try {
        context.closeHumanDetection();
      } catch (cleanupError) {
        console.error('Human-detection rollback failed:', cleanupError);
      }
    }
    throw error;
  }

  return createSession(context, signature, models, dataFiles);
}

function createSession(
  context: NvsStreamingContext,
  signature: string,
  models: HumanDetectionModel[],
  dataFiles: HumanDetectionData[],
): HumanDetectionSession {
  let disposed = false;
  const initializedFeatures = models.reduce((mask, model) => mask | model.features, 0);
  const initializedDataTypes = new Set(dataFiles.map((data) => data.dataType));
  return {
    context,
    assertReady() {
      if (disposed || activeHumanDetection?.context !== context || activeHumanDetection.signature !== signature) {
        throw new Error('The human-detection session is disposed.');
      }
    },
    supports(featureMask) {
      return !disposed && (initializedFeatures & featureMask) === featureMask;
    },
    hasData(dataType) {
      return !disposed && initializedDataTypes.has(dataType);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const active = activeHumanDetection;
      if (!active || active.context !== context || active.signature !== signature) return;
      active.references -= 1;
      if (active.references > 0) return;
      try {
        context.closeHumanDetection();
      } finally {
        activeHumanDetection = null;
      }
    },
  };
}
