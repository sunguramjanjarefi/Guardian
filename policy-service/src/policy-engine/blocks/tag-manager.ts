import { BasicBlock } from '@policy-engine/helpers/decorators';
import { PolicyComponentsUtils } from '@policy-engine/policy-components-utils';
import { ChildrenType, ControlType } from '@policy-engine/interfaces/block-about';
import { AnyBlockType, IPolicyDocument } from '@policy-engine/policy-engine.interface';
import { IPolicyUser } from '@policy-engine/policy-user';
import { BlockActionError } from '@policy-engine/errors';
import { TagType } from '@guardian/interfaces';
import { MessageServer, MessageType, TagMessage } from '@hedera-modules';

/**
 * Tag Manager
 */
@BasicBlock({
    blockType: 'tagsManager',
    commonBlock: true,
    about: {
        label: 'Tags Manager',
        title: `Add 'Tags Manager' Block`,
        post: true,
        get: true,
        children: ChildrenType.None,
        control: ControlType.UI,
        input: null,
        output: null,
        defaultEvent: false,
        properties: null,
    },
    variables: []
})
export class TagsManagerBlock {
    /**
     * Join GET Data
     * @param {IPolicyDocument | IPolicyDocument[]} documents
     * @param {IPolicyUser} user
     * @param {AnyBlockType} parent
     */
    public async joinData<T extends IPolicyDocument | IPolicyDocument[]>(
        documents: T, user: IPolicyUser, parent: AnyBlockType
    ): Promise<T> {
        const ref = PolicyComponentsUtils.GetBlockRef<AnyBlockType>(this);
        const getData = await this.getData(user);
        if (Array.isArray(documents)) {
            for (const doc of documents) {
                if (!doc.blocks) {
                    doc.blocks = {};
                }
                const tags = await this.getDocumentTags(doc.id, user);
                doc.blocks[ref.uuid] = { ...getData, tags };
            }
        } else {
            if (!documents.blocks) {
                documents.blocks = {};
            }
            const tags = await this.getDocumentTags(documents.id, user);
            documents.blocks[ref.uuid] = { ...getData, tags };
        }
        return documents;
    }

    /**
     * Get Document Tags
     * @param {IPolicyDocument} document
     * @param {IPolicyUser} user
     */
    private async getDocumentTags(documentId: string, user: IPolicyUser) {
        const ref = PolicyComponentsUtils.GetBlockRef<AnyBlockType>(this);
        const filter: any = {
            localTarget: documentId,
            entity: TagType.PolicyDocument
        }
        const tags = await ref.databaseServer.getTags(filter);
        const cache = await ref.databaseServer.getTagCache(filter);
        return {
            entity: TagType.PolicyDocument,
            refreshDate: cache[cache.length - 1]?.date,
            target: documentId,
            owner: user.did,
            tags,
        }
    }

    /**
     * Get block data
     * @param user
     */
    async getData(user: IPolicyUser): Promise<any> {
        const ref = PolicyComponentsUtils.GetBlockRef<AnyBlockType>(this);
        const data: any = {
            id: ref.uuid,
            blockType: ref.blockType
        }
        return data;
    }

    /**
     * Set block data
     * @param user
     * @param blockData
     */
    async setData(user: IPolicyUser, blockData: any): Promise<any> {
        console.log('---', blockData);
        const ref = PolicyComponentsUtils.GetBlockRef<AnyBlockType>(this);
        if (!blockData) {
            throw new BlockActionError(`Operation is unknown`, ref.blockType, ref.uuid);
        }
        switch (blockData.operation) {
            case 'create': {
                const { tag } = blockData;
                if (!tag || typeof tag !== 'object') {
                    throw new BlockActionError(`Invalid tag`, ref.blockType, ref.uuid);
                }

                const target = await this.getTarget(TagType.PolicyDocument, tag.localTarget || tag.target);

                if (target) {
                    tag.entity = TagType.PolicyDocument;
                    tag.target = null;
                    tag.localTarget = target.id;
                    tag.status = 'Draft';
                    tag.owner = user.did;
                    tag.policyId = ref.policyId;
                } else {
                    throw new BlockActionError(`Invalid target`, ref.blockType, ref.uuid);
                }

                console.log('--- create', tag);

                const item = await ref.databaseServer.createTag(tag);
                return item;
            }
            case 'search': {
                const { targets } = blockData;
                if (!Array.isArray(targets)) {
                    throw new BlockActionError(`Invalid targets`, ref.blockType, ref.uuid);
                }

                const items = await ref.databaseServer.getTags({
                    where: {
                        localTarget: { $in: targets },
                        entity: TagType.PolicyDocument
                    }
                });
                return items;
            }
            case 'synchronization': {
                const { target } = blockData;
                if (typeof target !== 'string') {
                    throw new BlockActionError(`Invalid target`, ref.blockType, ref.uuid);
                }

                const targetObject = await this.getTarget(TagType.PolicyDocument, target);

                if (targetObject) {
                    await this.synchronization(targetObject.topicId, targetObject.target, target);
                } else {
                    throw new BlockActionError(`Invalid target`, ref.blockType, ref.uuid);
                }

                const date = (new Date()).toISOString()
                const cache = await ref.databaseServer.getTagCache({
                    localTarget: target,
                    entity: TagType.PolicyDocument
                });
                if (cache.length) {
                    for (const item of cache) {
                        item.date = date;
                        await ref.databaseServer.updateTagCache(item);
                    }
                } else {
                    await ref.databaseServer.createTagCache({
                        localTarget: target,
                        entity: TagType.PolicyDocument,
                        date
                    });
                }

                return await this.getDocumentTags(target, user);
            }
            case 'delete': {
                const { uuid } = blockData;
                if (typeof uuid !== 'string') {
                    throw new BlockActionError(`Invalid uuid`, ref.blockType, ref.uuid);
                }

                const item = await ref.databaseServer.getTagById(uuid);
                if (!item || item.owner !== user.did) {
                    throw new BlockActionError(`Invalid tag`, ref.blockType, ref.uuid);
                }
                await ref.databaseServer.removeTag(item);

                break;
            }
            default: {
                throw new BlockActionError(`Operation is unknown`, ref.blockType, ref.uuid);
            }
        }
    }

    /**
     * Get target
     * @param tag
     */
    private async getTarget(entity: TagType, id: string): Promise<IPolicyDocument> {
        const ref = PolicyComponentsUtils.GetBlockRef<AnyBlockType>(this);
        switch (entity) {
            case TagType.PolicyDocument: {
                return await ref.databaseServer.getVcDocument({ id, policyId: ref.policyId });
            }
            default:
                return null;
        }
    }

    /**
     * Synchronization tags
     * @param tag
     */
    private async synchronization(
        topicId: string,
        target: string,
        localTarget: string
    ): Promise<void> {
        const ref = PolicyComponentsUtils.GetBlockRef<AnyBlockType>(this);

        const messageServer = new MessageServer(null, null, ref.dryRun);
        const messages = await messageServer.getMessages<TagMessage>(topicId, MessageType.Tag);
        const map = new Map<string, any>();
        for (const message of messages) {
            if (message.target === target) {
                map.set(message.getId(), { message, local: null });
            }
        }

        const items = await ref.databaseServer.getTags({
            localTarget,
            entity: TagType.PolicyDocument,
            status: 'Published'
        });
        for (const tag of items) {
            if (map.has(tag.messageId)) {
                map.get(tag.messageId).local = tag;
            } else {
                map.set(tag.messageId, { message: null, local: tag });
            }
        }

        for (const item of map.values()) {
            if (item.message) {
                const message = item.message;
                const tag = item.local ? item.local : {};

                tag.uuid = message.uuid;
                tag.name = message.name;
                tag.description = message.description;
                tag.owner = message.owner;
                tag.operation = message.operation;
                tag.target = message.target;
                tag.localTarget = localTarget;
                tag.entity = TagType.PolicyDocument;
                tag.messageId = message.getId();
                tag.topicId = message.getTopicId();
                tag.status = 'Published';

                if (tag.id) {
                    await ref.databaseServer.updateTag(tag);
                } else {
                    await ref.databaseServer.createTag(tag);
                }
            }
        }
    }

}