jQuery(document).ready(function(){
	var extendMethod = function(object, methodName, method) {
		if(typeof Object.defineProperty !== 'function') {
			object[methodName] = method;
		} else {
			Object.defineProperty(object, methodName, {
				configurable: false,
				enumerable: false,
				value: method,
			});
		}
	};
	// jQuery メソッドに outerHTML を追加
	extendMethod($.fn, 'outerHTML', function(s){
		return (s)
			? this.before(s).remove()
			: $("<p>").append(this.eq(0).clone()).html();
	});
	// 配列の重複を取り除く
	unique = function(array){
		var _targetArrayLen = array.length,
			_storageDict = new Object(),
			_resultArray = new Array(),
			_tempValue;
		for(var i = 0; i < _targetArrayLen; i++){
			_tempValue = array[i];
			if (!(_tempValue in _storageDict)){
				_storageDict[_tempValue] = true;
				_resultArray.push(_tempValue);
			}
		}
		return _resultArray;
	};
	// 改良版 typeOf（のさらに改良）
	// http://qiita.com/Hiraku/items/87e5d1cdaaa475c80cc2
	typeOf = function(x) {
		if (x === null) return 'null';
		if (x == null) return 'undefined';
		var type = typeof x, c = x.constructor, cName = c && c.name ? c.name : '';
		if (type === 'object') {
			if(jQuery && x instanceof jQuery){	// jQuery のオブジェクトかどうか欲しいじゃん？
				return 'jQuery';
			}
			return cName ? cName :
				Object.prototype.toString.call(x).slice(8, -1);
		}
		if(cName && type == cName.toLowerCase()){
			return cName;	// number と Number で違うみたいなケースが気持ち悪いので
		}
		return type;
	};
	
	var root = (function(){
		var root;
		var scripts = document.getElementsByTagName("script");
		var i = scripts.length;
		while (i--) {
			var match = scripts[i].src.match(/(^|.*\/)common\.js$/);
			if (match) {
				root = match[1];
				break;
			}
		}
		return root;
	})();	

	
	$(".search_after .item_box:nth-child(3n + 1)").each(function(){
		$(this).css('clear','both');
	});
	
	//thumbnail css
	$('.item_photo_thumbnail img').hover(function(){
		var _this = $(this),
			_prev = $('#'+_this.attr('id')+'prev');
		if(_prev.length) {
			$('.item_photo a, .item_photo_thumbnail img').removeClass('on');
			_prev.addClass('on');
			_this.addClass('on');
		}
	});
	
	//side select サブカテゴリ
	if ($("#side_search_category_list").length) {
		$("#side_search_category_list").narrows("#side_search_category_list_child");
	}

	// サブカテゴリが 1 件しかない親カテゴリの場合にサブカテゴリを非表示にする
	// 利用時はコメントアウトを解除のこと
	// ここが動作しない場合、137 行目以降で絞り込みを利用するようになっていてかつカテゴリを追加していないことが想定されるので、必ず確認してください
//	var _sideSearchCategoryAdjust = function(){
//			if($('#side_search_category_list_child [data-side_search_category_list="' + $('#side_search_category_list').val() + '"]').length == 1){
//				$('#side_search_category_list_child').prop('selectedIndex',0).css({'display':'none'});
//			} else {
//				$('#side_search_category_list_child').css({'display':'block'});
//			}
//	};
//	$('#side_search_category_list').on('narrowed',
//		function(){
//			_sideSearchCategoryAdjust();
//		}
//	);
//	_sideSearchCategoryAdjust();
	
	// カレンダー
	if($("input.cal").length) {
		$("input.cal").datepicker({
			showOn: "button",
			buttonImage: root + "../image/common/icon_cal.gif",
			buttonText: "カレンダー",
			buttonImageOnly: true,
			showAnim: "slideDown"
		});
	} 
	
	var dateCell = $('#date_cell');
	var dateCellHandler = function() {
		if( $('#date_cell').val().length == 0 ) {
			$('#date_from').attr('disabled', 'disabled');
			$('#date_to').attr('disabled', 'disabled');
			
			$('#date_from').val('');
			$('#date_to').val('');
		}
		else {
			$('#date_from').removeAttr('disabled');
			$('#date_to').removeAttr('disabled');
		}
	};
	if ( dateCell.length ) {
		dateCellHandler();
		dateCell.change(dateCellHandler);
	}
	
	// カテゴリの選択により、特定の項目を絞り込むサンプル
	// この場合は、メーカーを絞り込んでいます。
	if($('#ennarrow_maker').length > 0){
		// 定義部分ここから
		// カテゴリに応じたメーカーのリスト。連想配列で格納
		var _defaultID = 'ennarrow_maker',	/* ※←で指定する id は、絞り込みたいセレクトボックスの id を指定のこと */
			_ennarrowListAry = {
			'OA機器': {
				'パソコン':['HAL'],
				'パソコン周辺機器':['NEPHEW','TONY','大地放電'],
				'事務機器':['Bosat','NEPHEW','TONY','シロダ','ミニマム','上杉'],
			},
			'オフィスサプライ': {
				'オフィス消耗品':['インコ','カキノス','カクカン','キャプテン','シロダ','セイレイ鉛筆','ダイヤ','四角鉛筆','大地放電','東社化学'],
				'文房具':['Hoodies','Mariner','Me','TIGON','インコ','カキノス','カクカン','キャプテン','クイーンザク','シロダ','セイレイ鉛筆','四角鉛筆','東社化学','豊刃物'],
			},
			'オフィス用品': {
				'アタッシュケース':['パンジーコヤマ','ワンポタフィンク'],
				'オフィス什器':['SUCCESS','オオモリ','カワナカ','ニムラ'],
				'カメラ':['TONY'],
			},
			'その他': {
				'包装・梱包用品':['カミオカ'],
				'その他消耗品':['TGK','ダイトー','メショメル'],
			},
			// テスト用途のカテゴリーのため、実装時には削除のこと
			'テスト用カテゴリ': {
			},
		};
		// 定義部分ここまで

		// 実行部分なので、ここから下は変更不可
		var _defaultList = $('<div></div>'),
			_defaultListID = '#'+_defaultID,
			_ennarrowCell = $(_defaultListID).attr('name'),
			QS = new Object();
		_defaultList.html($(_defaultListID).html());
		if (location.search.length > 1) {
			var queryArray = location.search.substr(1).split("&"),
				qaLen = queryArray.length;
			for(var i = 0; i < qaLen; i++) {
				var kvArray = queryArray[i].split("=");
				QS[kvArray[0]] = kvArray[1];
			}
		}
		var _ennarrowListByCategory = function(){
			$(_defaultListID+' option[value!=""]').css('display','none');
			var _category = $('#side_search_category_list').val(),
				_type = $('#side_search_category_list_child').val();
			if(_category != ''){
				if(_type != ''){
					var _narrowItems = _ennarrowListAry[_category][_type],
						_narrowItemsLen = _narrowItems.length;
				} else {
					var _narrowItems = [];
					$.each(_ennarrowListAry[_category],function(){
						Array.prototype.push.apply(_narrowItems, this);
					});
					_narrowItems = unique(_narrowItems);
					var _narrowItemsLen = _narrowItems.length;
				}
				if(_narrowItems && _narrowItemsLen != 0){
					$(_defaultListID).val('');
					var _tmpObj = {};
					for(var i = 0; i < _narrowItemsLen; i++){
						_tmpObj[_narrowItems[i]] = true;
					}
					var _tempUnits = _defaultList.clone(),
						_resultUnits = '';
					$('option',_tempUnits).each(
						function(){
							var _this = $(this),
								_val = _this.val();
							if(_val == '' || _tmpObj[_val]){
								_resultUnits += _this.outerHTML();
							}
						}
					);
					$(_defaultListID).empty().html(_resultUnits).val('');
					if(QS[_ennarrowCell]) {
						$(_defaultListID).val(QS[_ennarrowCell]);
					}
				}
			} else {
				$(_defaultListID).html(_defaultList.html());
			}
		};
		$('#side_search_category_list,#side_search_category_list_child').on('change',
			function(){
				_ennarrowListByCategory();	// メーカーの絞り込み実行
			}
		);
		// 初回実行
		_ennarrowListByCategory();	// メーカーの絞り込み実行
	}
	// カテゴリの選択により、特定の項目を絞り込むサンプルここまで

	// カテゴリの選択により、特定の項目の表示を切り替えるサンプル
	// この場合は、カテゴリが「OA機器」の場合に「NEW」「おすすめ」などが入ったボックスを表示している
	if($('.box_option.showhide').length > 0){
		var _showHideOptionsByCategory = function(){
			var _category = $('#side_search_category_list').val();
			if(_category == 'OA機器'){
				if($('.box_option.showhide:visible').length == 0){
					$('.box_option.showhide input,.box_option.showhide select').each(function(){$(this).prop('disabled',false)});	// 表示前に disabled にした項目を解除しないと操作できなくなる
					$('.box_option.showhide').slideDown('fast');
				}
			} else {
				if($('.box_option.showhide:visible').length > 0){
					$('.box_option.showhide').slideUp('fast');
					$('.box_option.showhide input,.box_option.showhide select').each(function(){$(this).prop('disabled',true)});	// 項目を disabled にしないと、非表示にしても送信される
				}
			}
		};
		$('#side_search_category_list').on('change',
			function(){
				_showHideOptionsByCategory();	// オプション項目の表示/非表示
			}
		);
		// 初回実行
		_showHideOptionsByCategory();	// オプション項目の表示/非表示
	}
	// カテゴリの選択により、特定の項目の表示を切り替えるサンプルここまで

});