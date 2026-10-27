// Package app はユースケース層。transport から呼ばれ、domain と store を組み合わせる。
// ストアとイベントライタはこのパッケージのインターフェース越しに使い、実装は cmd で注入する。
package app
