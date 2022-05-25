import { Component, HostListener, OnInit, ViewChild } from '@angular/core';
import { BlockNode } from '../../helpers/tree-data-source/tree-data-source';
import { SchemaService } from 'src/app/services/schema.service';
import { Schema, SchemaHelper, SchemaStatus, Token } from '@guardian/interfaces';
import { PolicyEngineService } from 'src/app/services/policy-engine.service';
import { forkJoin } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { TokenService } from 'src/app/services/token.service';
import { BlockGroup, RegisteredBlocks } from '../../registered-blocks';
import { PolicyAction, SavePolicyDialog } from '../../helpers/save-policy-dialog/save-policy-dialog.component';
import { SetVersionDialog } from 'src/app/schema-engine/set-version-dialog/set-version-dialog.component';
import * as yaml from 'js-yaml';
import { Clipboard } from '@angular/cdk/clipboard';
import { ConfirmationDialogComponent } from 'src/app/components/confirmation-dialog/confirmation-dialog.component';
import { EventsOverview } from '../../helpers/events-overview/events-overview';
import { PolicyBlockModel, PolicyModel } from '../../policy-model';


/**
 * The page for editing the policy and blocks.
 */
@Component({
    selector: 'app-policy-configuration',
    templateUrl: './policy-configuration.component.html',
    styleUrls: ['./policy-configuration.component.css']
})
export class PolicyConfigurationComponent implements OnInit {
    loading: boolean = true;
    policyModel: PolicyModel;
    currentBlock: PolicyBlockModel | undefined;
    newBlockType: string;
    readonly!: boolean;
    currentView: string = 'blocks';
    code!: string;

    schemes!: Schema[];
    tokens!: Token[];
    policyId!: string;
    errors: any[] = [];
    errorsCount: number = -1;
    errorsMap: any;
    private _undoDepth: number = 0;

    colGroup1 = false;
    colGroup2 = false;
    colGroup3 = true;

    codeMirrorOptions: any = {
        theme: 'default',
        mode: 'application/ld+json',
        styleActiveLine: true,
        lineNumbers: true,
        lineWrapping: true,
        foldGutter: true,
        gutters: [
            'CodeMirror-linenumbers',
            'CodeMirror-foldgutter',
            'CodeMirror-lint-markers'
        ],
        autoCloseBrackets: true,
        matchBrackets: true,
        lint: true,
        readOnly: false,
        viewportMargin: Infinity
    };

    propTab: string = 'Properties';
    policyTab: string = 'Description';
    blockToCopy?: BlockNode;
    copyBlocksMode: boolean = false;
    groupBlocks: any = {
        Main: [],
        Documents: [],
        Tokens: [],
        Calculate: [],
        Report: [],
        UnGroupedBlocks: []
    };
    allEvents: any[] = [];
    eventVisible: string = 'All';
    eventsOverview!: EventsOverview;

    constructor(
        public registeredBlocks: RegisteredBlocks,
        private schemaService: SchemaService,
        private tokenService: TokenService,
        private policyEngineService: PolicyEngineService,
        private route: ActivatedRoute,
        private router: Router,
        private dialog: MatDialog
    ) {
        this.newBlockType = 'interfaceContainerBlock';
        this.policyModel = new PolicyModel();
    }

    ngOnInit() {
        this.loading = true;
        this.route.queryParams.subscribe(queryParams => {
            this.loadPolicy();
        });
    }

    loadPolicy(): void {
        const policyId = this.route.snapshot.queryParams['policyId'];
        if (!policyId) {
            this.policyModel = new PolicyModel();
            this.loading = false;
            return;
        }

        this.policyId = policyId;
        forkJoin([
            this.tokenService.getTokens(),
            this.policyEngineService.blockAbout(),
            this.policyEngineService.policy(policyId)
        ]).subscribe((data: any) => {
            const tokens = data[0] || [];
            const blockAbout = data[1] || {};
            const policy = data[2];

            this.registeredBlocks.registerConfig(blockAbout);
            this.tokens = tokens.map((e: any) => new Token(e));

            this.setPolicy(policy);

            if (!this.policyModel.valid) {
                setTimeout(() => { this.loading = false; }, 500);
                return;
            }

            this.schemaService.getSchemes(this.policyModel.topicId).subscribe((data2: any) => {
                const schemes = data2 || [];
                this.schemes = SchemaHelper.map(schemes) || [];
                this.schemes.unshift({ type: "" } as any);
                setTimeout(() => { this.loading = false; }, 500);
            }, (e) => {
                this.loading = false;
                console.error(e.error);
            });

            this.checkState();
        }, (error) => {
            this.loading = false;
            console.error(error);
        });
    }

    setPolicy(policy: any) {
        if (!policy) {
            this.policyModel = new PolicyModel();
            return;
        }
        this.policyModel = new PolicyModel(policy);
        this.currentView = 'blocks';
        this.readonly = this.policyModel.readonly;
        this.errors = [];
        this.errorsCount = -1;
        this.errorsMap = {};
        this.codeMirrorOptions.readOnly = this.readonly;
        this.onSelect(this.policyModel.root);
        this.policyModel.subscribe(() => {
            this.saveState();
            setTimeout(() => {
                if (this.eventsOverview) {
                    this.eventsOverview.render();
                }
            }, 10);
        })
    }

    updateTopMenu(block?: PolicyBlockModel) {
        if (!block) {
            return;
        }

        const allowedChildren = this.registeredBlocks.getAllowedChildren(block.blockType);
        const groupBlocks: any = {};
        const unGroupedBlocks: any[] = [];
        for (const key in BlockGroup) {
            this.groupBlocks[key] = [];
        }

        for (let i = 0; i < allowedChildren.length; i++) {
            const allowedChild = allowedChildren[i];
            const type = allowedChild.type;
            if (!allowedChild.group) {
                allowedChild.group = this.registeredBlocks.getGroup(allowedChild.type);
            }
            if (!allowedChild.header) {
                allowedChild.header = this.registeredBlocks.getHeader(allowedChild.type);
            }
            if (!groupBlocks[allowedChild.group]) {
                groupBlocks[allowedChild.group] = {};
            }
            if (allowedChild.group === BlockGroup.UnGrouped) {
                unGroupedBlocks.push({
                    type: type,
                    icon: this.registeredBlocks.getIcon(type),
                    name: this.registeredBlocks.getName(type),
                    title: this.registeredBlocks.getTitle(type)
                });
                continue;
            }
            if (!groupBlocks[allowedChild.group][allowedChild.header]) {
                groupBlocks[allowedChild.group][allowedChild.header] = [];
            }
            groupBlocks[allowedChild.group][allowedChild.header].push({
                type: type,
                icon: this.registeredBlocks.getIcon(type),
                name: this.registeredBlocks.getName(type),
                title: this.registeredBlocks.getTitle(type)
            });
        }

        const groupBlockKeys = Object.keys(groupBlocks);
        for (let i = 0; i < groupBlockKeys.length; i++) {
            const groupName = groupBlockKeys[i];
            const groupsWithHeaders = groupBlocks[groupName];
            const groupsWithHeadersKeys = Object.keys(groupsWithHeaders);
            for (let j = 0; j < groupsWithHeadersKeys.length; j++) {
                const subGroupName = groupsWithHeadersKeys[j];
                const subGroupElements = groupsWithHeaders[groupsWithHeadersKeys[j]];
                this.groupBlocks[groupName].push({
                    name: subGroupName
                });
                this.groupBlocks[groupName] = this.groupBlocks[groupName].concat(subGroupElements);
            }
        }

        this.groupBlocks.unGroupedBlocks = unGroupedBlocks;
    }

    public onInitViewer(event: EventsOverview) {
        this.eventsOverview = event;
    }

    public onSelect(block: any) {
        this.currentBlock = this.policyModel.getBlock(block);
        this.policyModel.checkChange();
        this.updateTopMenu(this.currentBlock)
        return false;
    }

    public onAdd(type: string) {
        if (this.currentBlock) {
            const newBlock = this.registeredBlocks.newBlock(type as any);
            newBlock.tag = this.policyModel.getNewTag();
            this.currentBlock.createChild(newBlock);
        }
    }

    public onDelete(block: BlockNode) {
        this.policyModel.removeBlock(block);
        return false;
    }

    public onReorder(blocks: BlockNode[]) {
        const root = blocks[0];
        if(root) {
            this.policyModel.rebuild(root.getJSON());
        } else {
            this.policyModel.rebuild();
        }
    }

    public onColGroup(n: number) {
        if (n == 1) {
            this.colGroup1 = !this.colGroup1;
        } else if (n == 2) {
            this.colGroup2 = !this.colGroup2;
        } else {
            this.colGroup3 = !this.colGroup3;
        }
    }

    onTreeChange(event: any) {
        setTimeout(() => {
            if (this.eventsOverview) {
                this.eventsOverview.render();
            }
        }, 10);
    }

    onShowEvent(type: string) {
        this.eventVisible = type;
    }

    onView(type: string) {
        this.loading = true;
        setTimeout(() => {
            this.chanceView(type);
            this.loading = false;
        }, 0);
    }

    private chanceView(type: string) {
        if (type == this.currentView) {
            return;
        }
        this.errors = [];
        this.errorsCount = -1;
        this.errorsMap = {};
        try {
            if (type == 'blocks') {
                let root = null;
                if (this.currentView == 'json') {
                    root = this.jsonToObject(this.code);
                } else if (this.currentView == 'yaml') {
                    root = this.yamlToObject(this.code);
                }
                this.policyModel.rebuild(root);
            } else if (type == 'json') {
                let code = "";
                if (this.currentView == 'blocks') {
                    code = this.objectToJson(this.policyModel.getJSON());
                } else if (this.currentView == 'yaml') {
                    code = this.yamlToJson(this.code);
                }
                this.code = code;
                this.codeMirrorOptions.mode = 'application/ld+json';
            } else if (type == 'yaml') {
                let code = "";
                if (this.currentView == 'blocks') {
                    code = this.objectToYaml(this.policyModel.getJSON());
                }
                if (this.currentView == 'json') {
                    code = this.jsonToYaml(this.code);
                }
                this.code = code;
                this.codeMirrorOptions.mode = 'text/x-yaml';
            }
            this.currentView = type;
        } catch (error: any) {
            this.errors = [error.message];
        }
    }

    private jsonToObject(json: string): any {
        return JSON.parse(json);
    }

    private yamlToObject(yamlString: string): any {
        return yaml.load(yamlString);
    }

    private objectToJson(root: any): string {
        return JSON.stringify(root, null, 2);
    }

    private yamlToJson(yaml: string): string {
        const root = this.yamlToObject(yaml);
        return this.objectToJson(root);
    }

    private objectToYaml(root: any): string {
        return yaml.dump(root, {
            indent: 4,
            lineWidth: -1,
            noRefs: false,
            noCompatMode: true
        });
    }

    private jsonToYaml(json: string): string {
        const root = this.jsonToObject(json);
        return this.objectToYaml(root);
    }

    public savePolicy() {
        this.chanceView('blocks');
        const root = this.policyModel.getJSON();
        if (root) {
            this.loading = true;
            this.policyEngineService.update(this.policyId, root).subscribe((policy) => {
                this.setPolicy(policy);
                this.clearState();
                this.loading = false;
            }, (e) => {
                console.error(e.error);
                this.loading = false;
            });
        }
    }

    public setVersion() {
        const dialogRef = this.dialog.open(SetVersionDialog, {
            width: '350px',
            disableClose: true,
            data: {}
        });
        dialogRef.afterClosed().subscribe((version) => {
            if (version) {
                this.publishPolicy(version);
            }
        });
    }

    private publishPolicy(version: string) {
        this.loading = true;
        this.policyEngineService.publish(this.policyId, version).subscribe((data: any) => {
            const { policies, isValid, errors } = data;
            if (isValid) {
                this.loadPolicy();
            } else {
                const blocks = errors.blocks;
                const invalidBlocks = blocks.filter((block: any) => !block.isValid);
                this.errors = invalidBlocks;
                this.errorsCount = invalidBlocks.length;
                this.errorsMap = {};
                for (let i = 0; i < invalidBlocks.length; i++) {
                    const element = invalidBlocks[i];
                    this.errorsMap[element.id] = element.errors;
                }
                this.loading = false;
            }
        }, (e) => {
            console.error(e.error);
            this.loading = false;
        });
    }

    public validationPolicy() {
        this.loading = true;
        const json = this.policyModel.getJSON();
        const object = {
            policyRoles: json?.policyRoles,
            policyTopics: json?.policyTopics,
            config: json?.config
        }
        this.policyEngineService.validate(object).subscribe((data: any) => {
            const { policy, results } = data;

            const config = policy.config;
            this.policyModel.rebuild(config);

            const errors = results.blocks.filter((block: any) => !block.isValid);
            this.errors = errors;
            this.errorsCount = errors.length;
            this.errorsMap = {};
            for (let i = 0; i < errors.length; i++) {
                const element = errors[i];
                this.errorsMap[element.id] = element.errors;
            }

            this.onSelect(this.policyModel.root);
            this.loading = false;
        }, (e) => {
            this.loading = false;
        });
    }

    public saveAsPolicy() {
        const dialogRef = this.dialog.open(SavePolicyDialog, {
            width: '500px',
            disableClose: true,
            data: {
                policy: this.policyModel,
                action: this.policyModel.status === 'DRAFT'
                    ? PolicyAction.CREATE_NEW_POLICY
                    : null
            },
            autoFocus: false
        });
        dialogRef.afterClosed().subscribe(async (result) => {
            if (result && this.policyModel) {
                this.loading = true;
                const json = this.policyModel.getJSON();

                const policy = Object.assign({}, json, result.policy);
                delete policy.id;
                delete policy.status;
                delete policy.owner;
                delete policy.version;

                if (result.action === PolicyAction.CREATE_NEW_POLICY) {
                    delete policy.uuid;
                } else if (result.action === PolicyAction.CREATE_NEW_VERSION) {
                    policy.previousVersion = json.version;
                }

                this.policyEngineService.create(policy).subscribe((policies: any) => {
                    const last = policies[policies.length - 1];
                    this.router.navigate(['/policy-configuration'], { queryParams: { policyId: last.id } });
                }, (e) => {
                    console.error(e.error);
                    this.loading = false;
                });
            }
        });
    }

    private getCurrentState(): string {
        if (this.currentView == 'blocks') {
            return JSON.stringify({
                view: this.currentView,
                value: this.objectToJson(this.policyModel.getJSON())
            });
        }
        if (this.currentView == 'yaml') {
            return JSON.stringify({
                view: this.currentView,
                value: this.code
            });
        }
        if (this.currentView == 'json') {
            return JSON.stringify({
                view: this.currentView,
                value: this.code
            });
        }
        return "";
    }

    public saveState() {
        if (this.readonly) {
            return;
        }

        let stateValue = localStorage[this.policyId] && JSON.parse(localStorage[this.policyId]);
        if (stateValue && stateValue.length > 5) {
            stateValue.shift();
            localStorage.setItem(this.policyId, JSON.stringify(stateValue));
        }
        else if (!stateValue) {
            stateValue = [];
        }

        if (this._undoDepth) {
            stateValue.slice(0, stateValue.length - this._undoDepth - 1);
            this._undoDepth = 0;
        }

        const state = this.getCurrentState();
        stateValue.push(state);
        localStorage.setItem(this.policyId, JSON.stringify(stateValue));
    }

    private checkState() {
        if (
            !this.readonly &&
            !this.compareStateAndConfig(this.policyModel.getJSON())
        ) {
            const applyChangesDialog = this.dialog.open(ConfirmationDialogComponent, {
                data: {
                    dialogTitle: "Apply latest changes",
                    dialogText: "Do you want to apply latest changes?"
                },
                disableClose: true
            })
            applyChangesDialog.afterClosed().subscribe((result) => {
                if (result) {
                    this.loadState();
                } else {
                    this.clearState();
                    this.saveState();
                }
            })
        } else {
            this.clearState();
            this.saveState();
        }
    }

    private compareStateAndConfig(policy: any): boolean {
        const JSONconfig = this.objectToJson(policy);

        const states = localStorage[this.policyId] && JSON.parse(localStorage[this.policyId]);
        if (!states) {
            return true;
        }

        const state = states[states.length - 1] && JSON.parse(states[states.length - 1]);
        if (!state) {
            return true;
        }
        if (state.view === 'json' || state.view === 'blocks') {
            return state.value === JSONconfig;
        }
        if (state.view === 'yaml') {
            return this.yamlToJson(state.value) === JSONconfig;
        }

        return true;
    }

    async loadState(states?: any, number?: number) {
        let stateValues = states || (localStorage[this.policyId] && JSON.parse(localStorage[this.policyId]));
        if (!stateValues) {
            return false;
        }

        let root: any = {};
        if (typeof number !== 'number') {
            root = JSON.parse(stateValues[stateValues.length - 1]);
        } else if (number >= 0) {
            const stateValue = stateValues[number];
            if (!stateValue) {
                return false;
            }

            root = JSON.parse(stateValue);
        }

        if (!root.view) {
            return false;
        }
        if (this.currentView !== root.view) {
            this.currentView = root.view;
            this.chanceView(root.view);
        }
        if (root.view === 'yaml' || root.view === 'json') {
            this.code = root.value;
        }
        if (root.view === 'blocks') {
            const policy = this.jsonToObject(root.value);
            this.policyModel.rebuild(policy);
            this.errors = [];
            this.errorsCount = -1;
            this.errorsMap = {};
        }

        return true;
    }

    clearState() {
        localStorage.removeItem(this.policyId);
    }

    async undoPolicy() {
        const stateValues = localStorage[this.policyId] && JSON.parse(localStorage[this.policyId]);
        if (!stateValues) {
            return;
        }

        if (await this.loadState(stateValues, stateValues.length - 2 - this._undoDepth)) {
            this._undoDepth++;
        }
    }

    async redoPolicy() {
        const stateValues = localStorage[this.policyId] && JSON.parse(localStorage[this.policyId]);
        if (!stateValues) {
            return;
        }

        if (await this.loadState(stateValues, stateValues.length - this._undoDepth)) {
            this._undoDepth--;
        }
    }

    onCopyBlock(block?: any) {
        if (this.currentBlock && block) {
            this.currentBlock.copyChild(block);
        }
    }

    @HostListener('document:copy', ['$event'])
    copy(event: ClipboardEvent) {
        if (this.currentBlock
            && this.copyBlocksMode
            && this.currentView === 'blocks'
            && !this.readonly) {
            event.preventDefault();
            navigator.clipboard.writeText(JSON.stringify(this.currentBlock));
        }
    }

    @HostListener('document:paste', ['$event'])
    paste(evt: ClipboardEvent) {
        if (this.currentBlock
            && this.copyBlocksMode
            && this.currentView === 'blocks'
            && !this.readonly) {
            evt.preventDefault();
            try {
                const parsedBlockData = JSON.parse(evt.clipboardData?.getData('text') || "null");
                this.onCopyBlock(parsedBlockData);
            }
            catch {
                console.warn("Block data is incorrect");
                return;
            }
        }
    }
}
