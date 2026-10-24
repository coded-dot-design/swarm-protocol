import type { SwarmBug, SwarmStatus } from '../integration/swarm-types.js';
export interface Point { x:number; y:number }
export interface Rect extends Point { left:number;right:number;top:number;bottom:number;width:number;height:number }
export interface Palette { base:string;power:string;bubbles?:string;calmBubbles?:string[] }
export interface Background { images:string[];sizes:string[];positions:string[];repeats:string[];origins:string[];clips:string[] }
export interface Target { element:HTMLElement;id:string;label:string;health:number;rect:Rect;visible:boolean;rendered:boolean;enrolled:boolean;bites:number;originalBackground:Background|null;palette:Palette|null;cornerRadius:number;pulsePhase:number;interactive:boolean;interactionUntil:number;hovered:boolean;bubbleTime:number;bubbleHeat:number;hitUntil:number;liquidUntil:number;liquidBite:number;liquidActive:boolean;moving:boolean;paintDirty:boolean;lastPaint:number;signalColor:string;colorFrom:string;colorAt:number;colorActive:boolean;calm?:boolean }
export interface TextArea { element:Element;nodes:Node[];rect:Rect|null;visible:boolean;revision:number;records:TextRecord[] }
export interface TextRecord { node:Node;original:string;latest:string;chars:string[];offsets:number[];glyphs:Glyph[];owner:TextArea;abandoned:boolean }
export interface Glyph {record:TextRecord;index:number;slot:number;letter:string;eaten:boolean;reservedBy:number;rect:Rect|null;revision:number;areaRevision:number;measuredAt:number}
export interface Bug extends SwarmBug {phase:number;feeds:number;lettersEaten:number;hitFlash:number;speed:number;biteIn:number;target:Target|null;siphonUntil:number;food:Glyph|null;lastFood:Glyph|null;foodSearchIn:number;foodCheckIn:number;foodWaitUntil:number;chewing:boolean;chewLeft:number;chewX?:number;chewY?:number;scatterUntil:number;scatterX:number;scatterY:number;pursuit:'attack'|'dash'|'exit'|'transit'|null;pursuitUntil:number;dashIn:number;dashX:number;dashY:number;orbit:number;attached:boolean}
export interface Particle extends Point {vx:number;vy:number;life:number;total:number;color:string;text?:string;score?:boolean;tier?:number;bubble?:boolean;radius?:number}
export interface Surface {element:HTMLElement;rect:Rect;visible:boolean;damage:number}
export interface StyleRecord {original:string;priority:string;latest:string|null;latestPriority:string|null;abandoned:boolean;requested?:string}
export interface CursorRecord {element:HTMLElement;original:string;priority:string;hadStyle:boolean;latest:string}
export interface AimEffect extends Point {kind:'miss'|'hit'|'kill'|'zap';life:number;total:number;radius?:number}
export interface GameState {status:SwarmStatus;score:number;best:number;wave:number;kills:number;combo:number;elapsed:number}
export interface CSSRuleView {selectorText?:string;style:CSSStyleDeclaration;cssRules?:CSSRuleList;styleSheet?:CSSStyleSheet;media?:MediaList;name?:string;cssText:string}
export type PointerNode=EventTarget & {closest?:Element['closest']};
