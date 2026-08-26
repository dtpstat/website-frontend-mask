declare const L: any;

interface EventTarget {
  setAttribute(name: string, value: string): void;
}

interface Element {
  dataset: DOMStringMap;
  hidden: boolean;
  placeholder: string;
  value: string;
}
