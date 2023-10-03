import { BlockValidator, IBlockProp } from '@policy-engine/block-validators';
import { CommonBlock } from './common';

/**
 * Policy roles block
 */
export class ToolBlock {
    /**
     * Block type
     */
    public static readonly blockType: string = 'tool';

    /**
     * Validate block options
     * @param validator
     * @param config
     */
    public static async validate(validator: BlockValidator, ref: IBlockProp): Promise<void> {
        try {
            await CommonBlock.validate(validator, ref);
            if (Array.isArray(ref.options.variables)) {
                for (const variable of ref.options.variables) {
                    if (!ref.options[variable.name]) {
                        validator.addError(`Option "${variable.name}" is not set`);
                    } else {
                        const value = ref.options[variable.name];
                        switch (variable.type) {
                            case 'Schema': {
                                const schema = validator.getSchema(value);
                                if (!schema) {
                                    validator.addError(`Schema with id "${value}" does not exist`);
                                } else if (!validator.compareSchema(variable.baseSchema, schema)) {
                                    validator.addError(`Schema is not supported`);
                                }
                                break;
                            }
                            case 'Token':
                                if (await validator.tokenNotExist(value)) {
                                    validator.addError(`Token with id ${value} does not exist`);
                                }
                                break;
                            case 'Role':
                                if (validator.permissionNotExist(value)) {
                                    validator.addError(`Permission ${value} not exist`);
                                }
                                break;
                            case 'Group':
                                if (validator.groupNotExist(value)) {
                                    validator.addError(`Group ${value} not exist`);
                                }
                                break;
                            case 'TokenTemplate':
                                if (validator.tokenTemplateNotExist(value)) {
                                    validator.addError(`Token "${value}" does not exist`);
                                }
                                break;
                            case 'Topic':
                                if (validator.topicTemplateNotExist(value)) {
                                    validator.addError(`Topic "${value}" does not exist`);
                                }
                                break;
                            default:
                                validator.addError(`Type '${variable.type}' does not exist`);
                                break;
                        }
                    }
                }
            }
        } catch (error) {
            validator.addError(
                `Unhandled exception ${validator.getErrorMessage(error)}`
            );
        }
    }
}