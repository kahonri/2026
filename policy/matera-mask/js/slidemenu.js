/*---------------------------------------------
	Slide Menu
  ---------------------------------------------*/

(function($){
$(document).ready(function() {

	var open = 0;

	$("#gnav_btn a").click(function() {
		$(this).blur();
		var $gnav = $("#globalnav #globalnav_in > ul");
		var gnavHeight = $gnav.height();
		if(!open) {
			open = 1;
			$(this).addClass("current");
			$gnav.css({display:"block", marginTop:-gnavHeight+"px"}, 300, "swing").animate({marginTop:"0"});
		} else {
			open = 0;
			$(this).removeClass("current");
			$gnav.animate({marginTop:-gnavHeight+"px"}, 300, "swing", function() {
				$(this).removeAttr("style");
			});
		}
		return false;
	});

});
})(jQuery);