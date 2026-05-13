/**
 * jQuery.tabswitch.js
 * @required: jQuery 1.2.6 <jquery.com>
 * @version: 1.01
 */


(function($){
	
	$.fn.tabswitch = function(config){
	
		var	_tabs,
			_pages,
			_tabactive,
			_defaultactive,
			_effect,
			_effectduration;
		
		_tabs = $(this);
		_pages = '.' + config.pageClass;
		_tabactive = config.tabActiveClass;
		_defaultactive = config.activeIndex || 0;
		_effect = config.effect || false;
		_effectduration = config.effectDuration || 'normal';
		
		var current;
		
		var activetab = _tabs.filter(':eq('+ _defaultactive +')');
		activetab.addClass(_tabactive);
		
		var activepage = activetab.attr('href');
		$(_pages + ':not(' + activepage + ')').hide();
		current = activepage;
		
		_tabs.click(function(){
			var targetpage = $(this).attr('href');
			if(targetpage != current){
				_tabs.removeClass(_tabactive);
				$(this).addClass(_tabactive);
				$(_pages).hide();
				if(_effect) $(targetpage).fadeIn(_effectduration);
				else $(targetpage).show();
				current = targetpage;
			}
			return false;
		});
	
	}
	
	
})(jQuery);

$(function(){
	$('.ws_prefectures a').tabswitch({
		pageClass: 'tabcontent',
		tabActiveClass: 'tabover',
		activeIndex: 0,
		effect: true,
		effectDuration: 'slow'
	});
	$('.tabindex2 a').tabswitch({
		pageClass: 'tabcontent2',
		tabActiveClass: 'tabover',
		activeIndex: 0,
		effect: true,
		effectDuration: 'slow'
	});
		$('.tabindex3 a').tabswitch({
		pageClass: 'tabcontent3',
		tabActiveClass: 'tabover',
		activeIndex: 0,
		effect: true,
		effectDuration: 'slow'
	});
	
});
//]]>
