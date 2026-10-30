import type { SwarmBug, SwarmStatus } from '../integration/swarm-types.js';
export interface Point { x:number; y:number }
export interface Rect extends Point { left:number;right:number;top:number;bottom:number;width:number;height:number }
export interface Palette { base:string;power:string;bubbles?:string;calmBubbles?:string[] }
export interface Background { images:string[];sizes:string[];positions:string[];repeats:string[];origins:string[];clips:string[] }
export interface Target { element:HTMLElement;id:string;label:string;health:number;rect:Rect;visible:boolean;rendered:boolean;enrolled:boolean;bites:number;originalBackground:Background|null;palette:Palette|null;cornerRadius:number;pulsePhase:number;interactive:boolean;interactionUntil:number;hovered:boolean;bubbleTime:number;bubbleHeat:number;hitUntil:number;liquidUntil:number;liquidBite:number;liquidActive:boolean;moving:boolean;paintDirty:boolean;lastPaint:number;signalColor:string;colorFrom:string;colorAt:number;colorActive:boolean;calm?:boolean }
/** A drawing view of one of the world's bugs (refreshed every frame; writing it changes nothing). */
export interface Bug extends SwarmBug {phase:number;feeds:number;lettersEaten:number;hitFlash:number;target:Target|null;siphonUntil:number;chewing:boolean;chewX:number;chewY:number;attached:boolean;pursuit:'attack'|'dash'|'exit'|'transit'|null;scatterUntil:number;stamp:number}
export interface Particle extends Point {vx:number;vy:number;life:number;total:number;color:string;text?:string;score?:boolean;tier?:number;bubble?:boolean;radius?:number}
export interface Surface {element:HTMLElement;rect:Rect;visible:boolean;damage:number}
export interface AimEffect extends Point {kind:'miss'|'hit'|'kill'|'zap';life:number;total:number;radius?:number}
export interface GameState {status:SwarmStatus;score:number;best:number;wave:number;kills:number;combo:number;elapsed:number}
export interface CSSRuleView {selectorText?:string;style:CSSStyleDeclaration;cssRules?:CSSRuleList;styleSheet?:CSSStyleSheet;media?:MediaList;name?:string;cssText:string}
export type PointerNode=EventTarget & {closest?:Element['closest']};
